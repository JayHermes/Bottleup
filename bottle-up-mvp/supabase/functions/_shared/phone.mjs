// Pure helpers shared by request-phone-otp and verify-phone-otp. Kept
// dependency-free (just Web Crypto, available in both Deno and Node) so they
// can be unit-tested directly, the same way receipt-core.mjs is tested
// without spinning up an edge function.

const utf8 = (text) => new TextEncoder().encode(text);
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// Accepts the formats a Nigerian user is likely to type — 0803..., 803...,
// 234803..., +234803... — and normalizes to E.164 (+234XXXXXXXXXX). Returns
// null for anything that isn't a plausible Nigerian mobile number. This
// intentionally does not try to infer the network from the prefix: mobile
// number portability means a 080... number can be on any network today, so
// the network must come from what the user (or the reward's catalog row)
// says, never from the digits.
export function normalizeNigerianPhone(input) {
  if (typeof input !== "string") return null;
  const digits = input.trim().replace(/[\s-]/g, "");
  let national;
  if (/^\+234\d{10}$/.test(digits)) national = digits.slice(4);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else return null;
  if (!/^[789]\d{9}$/.test(national)) return null; // Nigerian mobile numbers start 70/80/81/90/91...
  return `+234${national}`;
}

export function generateOtpCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000)); // 6-digit, no leading zero
}

// Hashed with a server-only pepper so the stored hash can't be brute-forced
// from a dumped table even though OTPs are only 6 digits.
export async function hashOtpCode(code, pepper) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(`${pepper}:${code}`))));
}

export function otpExpiry(fromDate = new Date(), minutes = 10) {
  return new Date(fromDate.getTime() + minutes * 60_000).toISOString();
}
