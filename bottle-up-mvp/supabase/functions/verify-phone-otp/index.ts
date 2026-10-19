import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { normalizeNigerianPhone, hashOtpCode } from "../_shared/phone.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 5;

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
    if (!supabaseUrl || !anonKey || !serviceKey || !pepper) return json({ error: "Phone verification is not configured" }, 503);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    const adminDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const phone = normalizeNigerianPhone(body?.phone);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!phone) return json({ error: "Enter a valid Nigerian phone number" }, 400);
    if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code" }, 400);

    const { data: attempt, error: fetchError } = await adminDb
      .from("phone_otp_requests")
      .select("id,code_hash,attempts,expires_at,consumed_at")
      .eq("user_id", authData.user.id)
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!attempt) return json({ error: "Request a new code first" }, 400);
    if (new Date(attempt.expires_at).getTime() < Date.now()) return json({ error: "That code has expired. Request a new one." }, 400);
    if (attempt.attempts >= MAX_ATTEMPTS) return json({ error: "Too many attempts. Request a new code." }, 429);

    const submittedHash = await hashOtpCode(code, pepper);
    if (submittedHash !== attempt.code_hash) {
      const { error: attemptsError } = await adminDb
        .from("phone_otp_requests")
        .update({ attempts: attempt.attempts + 1 })
        .eq("id", attempt.id);
      if (attemptsError) throw attemptsError;
      return json({ error: "Incorrect code" }, 400);
    }

    const { error: consumeError } = await adminDb
      .from("phone_otp_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", attempt.id)
      .is("consumed_at", null);
    if (consumeError) throw consumeError;

    const { error: profileError } = await adminDb
      .from("profiles")
      .update({ phone, phone_verified_at: new Date().toISOString() })
      .eq("id", authData.user.id);
    if (profileError) throw profileError;

    return json({ verified: true, phone });
  } catch (error) {
    console.error("verify-phone-otp:", error instanceof Error ? error.message : "Unexpected error");
    return json({ error: "Could not verify that code. Please try again." }, 500);
  }
});
