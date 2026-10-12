import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { Buffer } from "node:buffer";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "npm:@solana/web3.js@1.98.4";
import { receiptPayload, encodeReceipt, validateReceiptAccount, validateConfigAccount } from "./receipt-core.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let adminDb: ReturnType<typeof createClient> | undefined;
  let authorizedPickupId: string | undefined;
  try {
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Database configuration is incomplete" }, 503);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    adminDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await adminDb.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);
    const body = await req.json().catch(() => ({}));
    const pickupId = typeof body?.pickup_id === "string" ? body.pickup_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pickupId)) return json({ error: "A valid pickup_id UUID is required" }, 400);
    const { data: pickup, error: pickupError } = await adminDb.from("pickup_requests")
      .select("id,status,material_type,actual_weight_kg,photo_url,verified_at,solana_tx_signature")
      .eq("id", pickupId).maybeSingle();
    if (pickupError) throw pickupError;
    if (!pickup) return json({ error: "Pickup not found" }, 404);
    if (pickup.status !== "VERIFIED") return json({ error: "Only VERIFIED pickups can receive a receipt" }, 409);
    let payload;
    try { payload = await receiptPayload(pickup); }
    catch { return json({ error: "Verified weight or timestamp is invalid" }, 409); }
    authorizedPickupId = pickup.id;
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const programIdText = Deno.env.get("SOLANA_RECEIPT_PROGRAM_ID");
    const secretText = Deno.env.get("BOTTLEUP_SOLANA_AUTHORITY_SECRET");
    if (!rpcUrl || !programIdText || !secretText) return json({ error: "Solana receipt configuration is incomplete" }, 503);
    const secret = JSON.parse(secretText);
    if (!Array.isArray(secret) || secret.length !== 64 || secret.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error("Invalid signer configuration");
    const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
    const programId = new PublicKey(programIdText);
    const connection = new Connection(rpcUrl, "confirmed");
    if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Only Solana Devnet is enabled");
    const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
    const [receipt] = PublicKey.findProgramAddressSync([Buffer.from("receipt"), payload.pickupHash], programId);
    const existing = await connection.getAccountInfo(receipt, "confirmed");
    let signature: string | null = null;
    if (existing) {
      if (!existing.owner.equals(programId)) throw new Error("Unexpected receipt account owner");
      await validateReceiptAccount(existing.data, payload, authority.publicKey.toBytes());
      const history = await connection.getSignaturesForAddress(receipt, { limit: 20 }, "confirmed");
      signature = history.find(item => !item.err)?.signature ?? pickup.solana_tx_signature ?? null;
    } else {
      const configAccount = await connection.getAccountInfo(config, "confirmed");
      if (!configAccount || !configAccount.owner.equals(programId)) throw new Error("Receipt program is not initialized");
      await validateConfigAccount(configAccount.data, authority.publicKey.toBytes());
      const { error: pendingError } = await adminDb.from("pickup_requests").update({ solana_receipt_status: "pending", solana_receipt_error: null }).eq("id", pickupId).eq("status", "VERIFIED");
      if (pendingError) throw pendingError;
      const instruction = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: config, isSigner: false, isWritable: false },
          { pubkey: receipt, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(await encodeReceipt(payload)),
      });
      const blockhash = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ ...blockhash, feePayer: authority.publicKey }).add(instruction);
      tx.sign(authority);
      signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
      const { error: submittedError } = await adminDb.from("pickup_requests").update({ solana_tx_signature: signature, solana_receipt_status: "submitted" }).eq("id", pickupId).eq("status", "VERIFIED");
      if (submittedError) throw submittedError;
      const confirmation = await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");
      if (confirmation.value.err) throw new Error("Receipt transaction failed");
      const recorded = await connection.getAccountInfo(receipt, "confirmed");
      if (!recorded || !recorded.owner.equals(programId)) throw new Error("Confirmed receipt account is missing");
      await validateReceiptAccount(recorded.data, payload, authority.publicKey.toBytes());
    }
    const recordedAt = new Date().toISOString();
    const { error: updateError } = await adminDb.from("pickup_requests").update({
      solana_receipt_address: receipt.toBase58(), solana_tx_signature: signature,
      solana_receipt_status: "confirmed", solana_receipt_error: null, solana_recorded_at: recordedAt,
      // Keep previously deployed receipt UI fields compatible with the new program.
      onchain_tx_signature: signature, onchain_record_account: receipt.toBase58(), onchain_submitted_at: recordedAt,
    }).eq("id", pickupId).eq("status", "VERIFIED");
    if (updateError) throw updateError;
    return json({ status: "confirmed", receipt_address: receipt.toBase58(), tx_signature: signature, recovered: Boolean(existing), explorer_url: `https://explorer.solana.com/address/${receipt.toBase58()}?cluster=devnet` });
  } catch (error) {
    console.error("record-recycling-receipt:", error instanceof Error ? error.message : "Unexpected error");
    if (adminDb && authorizedPickupId) await adminDb.from("pickup_requests").update({ solana_receipt_status: "failed", solana_receipt_error: "Receipt submission failed; retry safely." }).eq("id", authorizedPickupId).eq("status", "VERIFIED");
    return json({ error: "Could not record receipt. Retry from All activity." }, 500);
  }
});
