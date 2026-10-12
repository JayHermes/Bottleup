// Supabase Edge Function: create one Solana receipt for an already VERIFIED pickup.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// SOLANA_RPC_URL, SOLANA_RECEIPT_PROGRAM_ID, BOTTLEUP_SOLANA_AUTHORITY_SECRET (JSON byte array).
import { createClient } from "npm:@supabase/supabase-js@2";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "npm:@solana/web3.js@1.98.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}
const utf8 = (s: string) => new TextEncoder().encode(s);
function u64le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = Number((n >> BigInt(8 * i)) & 255n);
  return out;
}
function i64le(n: bigint): Uint8Array { return u64le(BigInt.asUintN(64, n)); }
function u16le(n: number): Uint8Array { return new Uint8Array([n & 255, (n >> 8) & 255]); }
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
const MATERIAL_CODES: Record<string, number> = {
  "PET Bottles": 1, "Plastic Containers": 2, "HDPE Plastic": 3, "Mixed Plastic": 4,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const programIdText = Deno.env.get("SOLANA_RECEIPT_PROGRAM_ID");
    const secretText = Deno.env.get("BOTTLEUP_SOLANA_AUTHORITY_SECRET");
    if (!supabaseUrl || !anonKey || !serviceKey || !rpcUrl || !programIdText || !secretText) {
      return json({ error: "Server receipt configuration is incomplete" }, 500);
    }

    const bearer = req.headers.get("Authorization");
    if (!bearer) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await adminDb
      .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const pickupId = typeof body.pickup_id === "string" ? body.pickup_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pickupId)) {
      return json({ error: "A valid pickup_id UUID is required" }, 400);
    }

    const { data: pickup, error: pickupError } = await adminDb
      .from("pickup_requests")
      .select("id,status,material_type,actual_weight_kg,photo_url,verified_at,solana_receipt_address,solana_tx_signature,solana_receipt_status")
      .eq("id", pickupId).maybeSingle();
    if (pickupError) throw pickupError;
    if (!pickup) return json({ error: "Pickup not found" }, 404);
    if (pickup.status !== "VERIFIED") return json({ error: "Only VERIFIED pickups can receive an on-chain receipt" }, 409);
    if (!(Number(pickup.actual_weight_kg) > 0)) return json({ error: "Verified weight is missing" }, 409);
    if (!pickup.verified_at) return json({ error: "Verified timestamp is missing" }, 409);

    if (pickup.solana_receipt_status === "confirmed" && pickup.solana_receipt_address) {
      return json({ status: "confirmed", receipt_address: pickup.solana_receipt_address, tx_signature: pickup.solana_tx_signature });
    }

    const secret = Uint8Array.from(JSON.parse(secretText));
    const authority = Keypair.fromSecretKey(secret);
    const programId = new PublicKey(programIdText);
    const connection = new Connection(rpcUrl, "confirmed");
    const pickupHash = await sha256(utf8(pickup.id));
    const evidenceHash = pickup.photo_url ? await sha256(utf8(pickup.photo_url)) : new Uint8Array(32);
    const materialCode = MATERIAL_CODES[pickup.material_type] ?? 255;
    const weightGrams = BigInt(Math.round(Number(pickup.actual_weight_kg) * 1000));
    const verifiedAt = BigInt(Math.floor(new Date(pickup.verified_at).getTime() / 1000));
    if (weightGrams <= 0n || verifiedAt <= 0n) return json({ error: "Invalid verified weight or timestamp" }, 409);

    const [config] = PublicKey.findProgramAddressSync([utf8("config")], programId);
    const [receipt] = PublicKey.findProgramAddressSync([utf8("receipt"), pickupHash], programId);

    // Recover safely if chain confirmation succeeded but the DB update timed out.
    const existing = await connection.getAccountInfo(receipt, "confirmed");
    if (existing) {
      const { error: recoverError } = await adminDb.from("pickup_requests").update({
        solana_receipt_address: receipt.toBase58(),
        solana_receipt_status: "confirmed",
        solana_receipt_error: null,
        solana_recorded_at: new Date().toISOString(),
      }).eq("id", pickupId).eq("status", "VERIFIED");
      if (recoverError) throw recoverError;
      return json({ status: "confirmed", receipt_address: receipt.toBase58(), tx_signature: pickup.solana_tx_signature ?? null, recovered: true });
    }

    const { data: configAccount, error: configError } = await connection.getAccountInfo(config)
      .then(info => ({ data: info, error: null })).catch(error => ({ data: null, error }));
    if (configError) throw configError;
    if (!configAccount) return json({ error: "Receipt program is not initialized on this network" }, 503);

    await adminDb.from("pickup_requests").update({
      solana_receipt_status: "pending", solana_receipt_error: null,
    }).eq("id", pickupId).eq("status", "VERIFIED");

    const discriminator = (await sha256(utf8("global:record_receipt"))).slice(0, 8);
    const data = concat(discriminator, pickupHash, u64le(weightGrams), u16le(materialCode), evidenceHash, i64le(verifiedAt));
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: receipt, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(authority);
    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await connection.confirmTransaction(signature, "confirmed");

    const { error: updateError } = await adminDb.from("pickup_requests").update({
      solana_receipt_address: receipt.toBase58(),
      solana_tx_signature: signature,
      solana_receipt_status: "confirmed",
      solana_receipt_error: null,
      solana_recorded_at: new Date().toISOString(),
    }).eq("id", pickupId).eq("status", "VERIFIED");
    if (updateError) throw updateError;

    return json({
      status: "confirmed",
      receipt_address: receipt.toBase58(),
      tx_signature: signature,
      explorer_url: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected receipt error";
    console.error("record-recycling-receipt:", message);
    return json({ error: "Could not record receipt", detail: message }, 500);
  }
});
