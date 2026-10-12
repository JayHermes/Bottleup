// Devnet-only, rate-limited resume of an existing authority-owned loader buffer.
import { readFile } from 'node:fs/promises'
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
const [bufferAddress] = process.argv.slice(2)
if (!bufferAddress) throw new Error('Supply the existing deployment buffer address.')
const connection = new Connection('https://api.devnet.solana.com', { commitment: 'confirmed', disableRetryOnRateLimit: false })
if (await connection.getGenesisHash() !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('Devnet required')
const root = new URL('../', import.meta.url)
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(new URL('wallets/devnet-authority.json', root), 'utf8'))))
const binary = await readFile(new URL('target/deploy/bottle_up_receipts.so', root))
const buffer = new PublicKey(bufferAddress)
const loader = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const account = await connection.getAccountInfo(buffer)
if (!account || !account.owner.equals(loader) || account.data.readUInt32LE(0) !== 1 || account.data[4] !== 1 || !new PublicKey(account.data.subarray(5, 37)).equals(authority.publicKey) || account.data.length !== binary.length + 37) throw new Error('Buffer ownership, authority or size mismatch')
const pending = []
for (let offset = 0; offset < binary.length; offset += 900) {
  const bytes = binary.subarray(offset, offset + 900)
  if (!account.data.subarray(offset + 37, offset + 37 + bytes.length).equals(bytes)) pending.push({ offset, bytes })
}
console.log(`Resuming ${pending.length} missing chunks in buffer ${buffer.toBase58()}`)
let blockhash, obtainedAt = 0, completed = 0
for (const { offset, bytes } of pending) {
  let done = false
  for (let attempt = 0; attempt < 4 && !done; attempt++) {
    try {
      if (!blockhash || Date.now() - obtainedAt > 15000) { blockhash = await connection.getLatestBlockhash('confirmed'); obtainedAt = Date.now() }
      // Solana loader-v3 Write: bincode enum(u32), offset(u32), Vec length(u64), bytes.
      const data = Buffer.alloc(16 + bytes.length)
      data.writeUInt32LE(1, 0); data.writeUInt32LE(offset, 4); data.writeBigUInt64LE(BigInt(bytes.length), 8); bytes.copy(data, 16)
      const ix = new TransactionInstruction({ programId: loader, keys: [{ pubkey: buffer, isSigner: false, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: false }], data })
      const tx = new Transaction({ ...blockhash, feePayer: authority.publicKey }).add(ix)
      tx.sign(authority)
      const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 })
      let confirmed = false
      for (let poll = 0; poll < 30; poll++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const status = (await connection.getSignatureStatuses([signature])).value[0]
        if (status?.err) throw new Error(JSON.stringify(status.err))
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') { confirmed = true; break }
      }
      if (!confirmed) throw new Error('Write confirmation timed out')
      done = true
    } catch (error) {
      if (attempt === 3) throw error
      blockhash = undefined
      console.log(`Retrying chunk at ${offset} after RPC error (${attempt + 1}/3)`)
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
    }
  }
  completed++
  if (completed % 10 === 0 || completed === pending.length) console.log(`Confirmed ${completed}/${pending.length} chunks`)
  await new Promise(resolve => setTimeout(resolve, 2000))
}
const uploaded = await connection.getAccountInfo(buffer)
if (!uploaded?.data.subarray(37).equals(binary)) throw new Error('Uploaded program differs from compiled binary')
console.log('Upload complete; buffer exactly matches the compiled binary.')
