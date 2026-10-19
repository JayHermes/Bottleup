import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { buildVtpassPayload, interpretVtpassResponse, vtpassRequestId } from "../_shared/vtpass.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function callVtpass(baseUrl: string, path: string, apiKey: string, secretKey: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, "secret-key": secretKey },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let adminDb: ReturnType<typeof createClient> | undefined;
  let redemptionId: string | undefined;
  try {
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vtpassKey = Deno.env.get("VTPASS_API_KEY");
    const vtpassSecret = Deno.env.get("VTPASS_SECRET_KEY");
    const vtpassBaseUrl = Deno.env.get("VTPASS_BASE_URL") || "https://vtpass.com/api";
    if (!supabaseUrl || !anonKey || !serviceKey || !vtpassKey || !vtpassSecret) {
      return json({ error: "Airtime/data fulfilment is not configured" }, 503);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    adminDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.redemption_id === "string" ? body.redemption_id : "";
    if (!uuidRe.test(id)) return json({ error: "A valid redemption_id is required" }, 400);

    const { data: redemption, error: redemptionError } = await adminDb
      .from("reward_redemptions")
      .select("id,user_id,reward_id,kind,status,phone,network")
      .eq("id", id)
      .maybeSingle();
    if (redemptionError) throw redemptionError;
    if (!redemption || redemption.user_id !== authData.user.id) return json({ error: "Reward request not found" }, 404);
    if (!["airtime", "data"].includes(redemption.kind)) return json({ error: "Not an airtime or data redemption" }, 409);
    if (redemption.status !== "processing") {
      // Already resolved (possibly by a previous call to this same function
      // that the client retried after a network blip) — report what we have
      // instead of erroring or billing VTpass twice.
      return json({ status: redemption.status, redemption_id: redemption.id });
    }
    redemptionId = redemption.id;

    const { data: reward, error: rewardError } = await adminDb
      .from("reward_catalog")
      .select("amount_naira,vtpass_service_id,vtpass_variation_code")
      .eq("id", redemption.reward_id)
      .maybeSingle();
    if (rewardError) throw rewardError;
    if (!reward?.amount_naira) throw new Error("Reward catalog entry is missing its VTpass amount");

    const requestId = vtpassRequestId(redemption.id);
    const payload = buildVtpassPayload({
      kind: redemption.kind,
      network: redemption.network,
      phone: redemption.phone,
      amountNaira: reward.amount_naira,
      vtpassServiceId: reward.vtpass_service_id,
      vtpassVariationCode: reward.vtpass_variation_code,
      requestId,
    });

    let { result } = await callVtpass(vtpassBaseUrl, "/pay", vtpassKey, vtpassSecret, payload);
    let outcome = interpretVtpassResponse(result);
    if (outcome === "pending") {
      // Give VTpass a moment to settle, then ask once what actually happened
      // rather than guess. If it's still unclear, fail closed (see catch
      // block / below) so the user is never left without airtime or points.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const requery = await callVtpass(vtpassBaseUrl, "/requery", vtpassKey, vtpassSecret, { request_id: requestId });
      result = requery.result;
      outcome = interpretVtpassResponse(result);
    }
    const finalStatus = outcome === "fulfilled" ? "fulfilled" : "failed";

    const { error: resultError } = await adminDb.rpc("process_airtime_result", {
      p_id: redemption.id,
      p_status: finalStatus,
      p_provider: "vtpass",
      p_provider_request_id: requestId,
      p_provider_response: result,
    });
    if (resultError && !/already has a result/i.test(resultError.message || "")) throw resultError;

    return json({ status: finalStatus, redemption_id: redemption.id });
  } catch (error) {
    console.error("fulfil-airtime-reward:", error instanceof Error ? error.message : "Unexpected error");
    if (adminDb && redemptionId) {
      // Fail closed: if we can't tell what VTpass did, don't leave the
      // redemption stuck in "processing" forever — mark it failed so
      // post_points() refunds the user's points automatically. If it was
      // already resolved by the time we get here, this call is a no-op
      // (the RPC rejects a non-"processing" row) and we just swallow that.
      await adminDb.rpc("process_airtime_result", {
        p_id: redemptionId,
        p_status: "failed",
        p_provider: "vtpass",
        p_provider_request_id: null,
        p_provider_response: { error: "fulfilment_error" },
      }).then(undefined, () => {});
    }
    return json({ error: "Could not complete this top-up. Any points spent have been refunded." }, 502);
  }
});
