const utf8 = text => new TextEncoder().encode(text)
export const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
export const discriminator = async name => (await sha256(utf8(name))).slice(0, 8)
const materialCodes = { 'PET Bottles': 1, 'Plastic Containers': 2, 'HDPE Plastic': 3, 'Mixed Plastic': 4 }
// Must match BOTTLES_PER_KG in bottle-up-mvp/src/main.jsx — the same approximation
// used on the pickup form, applied here to the admin-verified weight so the
// on-chain bottle count always reflects the actual (not estimated) collection.
const BOTTLES_PER_KG = 50

export async function receiptPayload(pickup) {
  const weight = Math.round(Number(pickup.actual_weight_kg) * 1000)
  const bottleCount = Math.round(Number(pickup.actual_weight_kg) * BOTTLES_PER_KG)
  const timestamp = Math.floor(new Date(pickup.verified_at).getTime() / 1000)
  if (pickup.status !== 'VERIFIED' || !Number.isSafeInteger(weight) || weight <= 0 || weight > 20000000 ||
      !Number.isSafeInteger(bottleCount) || bottleCount <= 0 || bottleCount > 4294967295 ||
      !Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error('Invalid verified pickup')
  return {
    pickupHash: await sha256(utf8(pickup.id)),
    evidenceHash: pickup.photo_url ? await sha256(utf8(pickup.photo_url)) : new Uint8Array(32),
    weightGrams: BigInt(weight),
    bottleCount,
    materialCode: materialCodes[pickup.material_type] ?? 255,
    verifiedAt: BigInt(timestamp),
  }
}

export async function encodeReceipt(payload) {
  const bytes = new Uint8Array(94)
  const view = new DataView(bytes.buffer)
  bytes.set(await discriminator('global:record_receipt'), 0)
  bytes.set(payload.pickupHash, 8)
  view.setBigUint64(40, payload.weightGrams, true)
  view.setUint32(48, payload.bottleCount, true)
  view.setUint16(52, payload.materialCode, true)
  bytes.set(payload.evidenceHash, 54)
  view.setBigInt64(86, payload.verifiedAt, true)
  return bytes
}

const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index])
export async function validateReceiptAccount(bytes, payload, authorityBytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length !== 127 || !equal(bytes.slice(0, 8), await discriminator('account:RecyclingReceipt')) ||
      !equal(bytes.slice(8, 40), payload.pickupHash) || view.getBigUint64(40, true) !== payload.weightGrams ||
      view.getUint32(48, true) !== payload.bottleCount || view.getUint16(52, true) !== payload.materialCode ||
      !equal(bytes.slice(54, 86), payload.evidenceHash) || view.getBigInt64(86, true) !== payload.verifiedAt ||
      !equal(bytes.slice(94, 126), authorityBytes)) {
    throw new Error('On-chain receipt does not match the verified pickup')
  }
}
export async function validateConfigAccount(bytes, authorityBytes) {
  if (bytes.length !== 41 || !equal(bytes.slice(0, 8), await discriminator('account:ReceiptConfig')) || !equal(bytes.slice(8, 40), authorityBytes)) throw new Error('Receipt authority configuration does not match')
}
