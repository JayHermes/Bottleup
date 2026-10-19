import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { normalizeNigerianPhone, generateOtpCode, hashOtpCode, otpExpiry } from "../_shared/phone.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pepper = Deno.env.get("PHONE_OTP_PEPPER");
    const termiiKey = Deno.env.get("TERMII_API_KEY");
    const termiiSender = Deno.env.get("TERMII_SENDER_ID");
    if (!supabaseUrl || !anonKey || !serviceKey || !pepper || !termiiKey || !termiiSender) {
      return json({ error: "Phone verification is not configured" }, 503);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    const adminDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const phone = normalizeNigerianPhone(body?.phone);
    if (!phone) return json({ error: "Enter a valid Nigerian phone number" }, 400);

    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recent, error: recentError } = await adminDb
      .from("phone_otp_requests")
      .select("created_at")
      .eq("user_id", authData.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (recentError) throw recentError;
    if (recent && recent.length > 0) {
      const lastSentMs = Date.now() - new Date(recent[0].created_at).getTime();
      if (lastSentMs < RESEND_COOLDOWN_SECONDS * 1000) {
        return json({ error: `Wait ${Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - lastSentMs) / 1000)}s before requesting another code` }, 429);
      }
      if (recent.length >= MAX_REQUESTS_PER_HOUR) {
        return json({ error: "Too many codes requested. Try again in an hour." }, 429);
      }
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code, pepper);
    const { data: inserted, error: insertError } = await adminDb
      .from("phone_otp_requests")
      .insert({ user_id: authData.user.id, phone, code_hash: codeHash, expires_at: otpExpiry() })
      .select("id")
      .single();
    if (insertError) throw insertError;

    try {
      const response = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: termiiKey,
          to: phone,
          from: termiiSender,
          sms: `${code} is your Bottle Up verification code. It expires in 10 minutes.`,
          type: "plain",
          channel: "generic",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.message_id === undefined && result?.code && result.code !== "ok") {
        throw new Error(`Termii responded with ${response.status}`);
      }
    } catch (sendError) {
      // The code was never delivered — don't leave an unusable row that
      // would otherwise burn into the hourly rate limit for nothing.
      await adminDb.from("phone_otp_requests").delete().eq("id", inserted.id);
      throw sendError;
    }

    return json({ sent: true, phone, expires_in_seconds: 600 });
  } catch (error) {
    console.error("request-phone-otp:", error instanceof Error ? error.message : "Unexpected error");
    return json({ error: "Could not send a verification code. Please try again." }, 502);
  }
});
