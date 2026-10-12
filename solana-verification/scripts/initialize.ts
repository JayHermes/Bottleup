import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BottleUpReceipts as anchor.Program;
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const existing = await provider.connection.getAccountInfo(config, "confirmed");
  if (existing) {
    const account = await program.account.receiptConfig.fetch(config);
    if (!account.authority.equals(provider.wallet.publicKey)) {
      throw new Error(
        `Receipt config already initialized by ${account.authority.toBase58()}; refusing to change authority.`
      );
    }
    console.log("Receipt config already initialized for this wallet:", config.toBase58());
    return;
  }

  await program.methods.initialize().accounts({
    authority: provider.wallet.publicKey,
    config,
  }).rpc();
  console.log("Initialized Bottle Up receipt authority:", provider.wallet.publicKey.toBase58());
  console.log("Config PDA:", config.toBase58());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
