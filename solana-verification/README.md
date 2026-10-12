# Bottle Up Solana recycling receipts (Devnet first)

This is an additive integration for the existing React/Vite + Supabase app. The existing admin verification remains the source of truth; only rows already in `VERIFIED` state may be written on-chain.

## Receipt design

- One PDA per pickup: `["receipt", sha256(pickup_request_uuid)]`. The program's `init` makes duplicate receipts impossible.
- On-chain: pickup UUID hash, actual weight in grams, material code, optional evidence hash, verification timestamp, and verifier public key.
- Off-chain: names, contact information, pickup address, photos, and other personal information stay in Supabase.
- Network: Solana Devnet during testing. Do not use mainnet until tests, access controls, retries, and operational key custody have been reviewed.

Material codes: 1 = PET Bottles, 2 = Plastic Containers, 3 = HDPE Plastic, 4 = Mixed Plastic, 255 = Other/unknown.

## Prerequisites

Install Rust, Solana CLI, Anchor CLI 0.31.1, Node.js, and Yarn. See https://solana.com/docs/intro/quick-start/build-first-program.

## Build and deploy

From this directory:

1. Generate a deployer wallet if needed: `solana-keygen new`.
2. Point CLI at Devnet: `solana config set --url devnet`.
3. Obtain Devnet SOL: `solana airdrop 2`.
4. Install Anchor dependencies if prompted: `anchor --version` should report 0.31.1.
5. Run `anchor build` once to generate the program keypair under `target/deploy` (the first build may require the placeholder ID to be synced; if so, run `anchor keys sync` and rebuild).
6. Run `anchor keys sync` to make the program ID in Anchor.toml and lib.rs match the generated program keypair, then run `anchor build` again.
7. Run `anchor deploy --provider.cluster devnet`.
8. Initialize the config exactly once, using the deployer wallet that should control receipts. Do not let an untrusted wallet initialize first: run `anchor run initialize`. The script refuses to claim an already-initialized config owned by a different wallet.

Keep the deployer keypair private. Never commit it to GitHub.

## Database migration

Apply `migrations/202610120001_add_solana_receipt_fields.sql` to the correct Supabase project after confirming you have a backup and are targeting the intended environment. This migration only adds columns/indexes; it does not bootstrap or reset the database.

## Important status

This commit contains the on-chain program and database tracking schema. It does not yet wire a Supabase Edge Function into the live admin verification action or display receipts in the UI. Do not claim live integration until those pieces are implemented, tested on Devnet, and deployed. A Solana transaction proves an authorized verifier wrote the record; it does not independently prove that the physical material was recycled.

## Supabase Edge Function setup

The function is at `bottle-up-mvp/supabase/functions/record-recycling-receipt/index.ts`. It requires an authenticated Bottle Up admin and only accepts pickup rows whose status is already `VERIFIED`.

After deploying the Anchor program and applying the migration, set these Supabase Edge Function secrets in the correct project:

- `SOLANA_RPC_URL`: Devnet RPC endpoint
- `SOLANA_RECEIPT_PROGRAM_ID`: deployed program ID
- `BOTTLEUP_SOLANA_AUTHORITY_SECRET`: JSON array from the authority keypair secret bytes. Store only in Supabase secrets; never commit it.
- Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions in the normal environment.

From the app's Supabase project, deploy with the Supabase CLI, for example:
```sh
supabase functions deploy record-recycling-receipt
```
Configure the secrets using `supabase secrets set` or the Supabase dashboard. Do not paste secret values into chat or source control.

The admin verification action now calls the function after `verify_pickup` succeeds. Verified pickups without a saved transaction signature show a retry action. The receipt link is shown on verified pickup cards when a transaction is recorded.

Before live use, verify the app's actual Supabase project, install/build the Anchor program, initialize the on-chain config with the same authority key used by the Edge Function, and complete a Devnet end-to-end test. The Edge Function currently uses the Devnet Explorer URL in the UI.
