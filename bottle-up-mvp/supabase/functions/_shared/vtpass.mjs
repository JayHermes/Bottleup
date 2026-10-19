// Pure VTpass request/response shaping, kept separate from index.ts so it
// can be unit-tested without a live network call or a Deno runtime.
//
// NOTE ON ACCURACY: this follows VTpass's publicly documented /pay and
// /requery contract as of this writing (request_id, serviceID, amount,
// phone, billersCode, variation_code; response.code "000" = successful).
// VTpass's own dashboard is the source of truth for serviceIDs and variation
// codes — confirm AIRTIME_SERVICE_IDS below (especially the 9mobile entry,
// which VTpass has historically listed under the legacy "etisalat" service
// ID) and any catalog vtpass_service_id/vtpass_variation_code values against
// your VTpass account before going live.
export const AIRTIME_SERVICE_IDS = {
  mtn: "mtn",
  glo: "glo",
  airtel: "airtel",
  "9mobile": "etisalat",
};

// request_id must be unique per attempt and, by VTpass convention, is
// recommended to be prefixed with a timestamp so it's queryable. Reusing the
// same redemption id for every retry keeps our own idempotency intact and
// still satisfies that convention.
export function vtpassRequestId(redemptionId, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  return `${stamp}${redemptionId.replace(/-/g, "")}`.slice(0, 50);
}

export function buildVtpassPayload({ kind, network, phone, amountNaira, vtpassServiceId, vtpassVariationCode, requestId }) {
  if (kind === "data") {
    return {
      request_id: requestId,
      serviceID: vtpassServiceId,
      billersCode: phone,
      variation_code: vtpassVariationCode,
      phone,
      amount: amountNaira,
    };
  }
  const serviceID = AIRTIME_SERVICE_IDS[network];
  if (!serviceID) throw new Error(`No VTpass serviceID mapped for network "${network}"`);
  return { request_id: requestId, serviceID, amount: amountNaira, phone };
}

// VTpass's own transaction status lives at response.content.transactions.status
// (delivered/pending/failed/initiated-...) with a top-level response.code as
// a coarser signal ("000" = accepted). We treat anything that isn't a clear
// success as "pending" so the caller can requery rather than guess.
export function interpretVtpassResponse(payload) {
  const code = payload?.code;
  const status = (payload?.content?.transactions?.status || payload?.transactions?.status || "").toLowerCase();
  if (code === "000" && (status === "delivered" || status === "successful" || status === "")) return "fulfilled";
  if (status === "failed" || (code && code !== "000" && code !== "099")) return "failed";
  return "pending"; // 099 ("pending") or no clear status yet — needs a requery
}
