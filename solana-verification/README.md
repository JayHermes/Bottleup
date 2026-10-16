# BottleUp Solana receipts (Devnet)

BottleUp records one receipt per verified pickup at a deterministic PDA: `["receipt", sha256(pickup_uuid)]`. Receipts hold the pickup hash, verified grams, bottle count (grams ÷ 1000 × 50, the same approximation used on BottleUp's pickup form, applied to the admin-verified weight), material code, evidence-reference hash, timestamp, and verifier. Addresses, names, photographs, and contact details stay off-chain. A receipt proves an authorized attestation, not independent proof of physical recycling.

## Deployment identity

- Program: `F8VR44MDbcA6ZFNaz5UerqZLnbVwT7DPKuqNaxLPd6C`
- Authority: `5a65byZRjdDsn3PWZW7a9TeuEVEwZSpLdh1PaPH2kqaF`
- Network: Devnet only. The Edge Function checks the network genesis hash.
- Supabase project: `sdubpqggmhadoqmjrgaf` (BottleUP).
- Function: `record-recycling-receipt`.

Material codes: PET Bottles = 1; Plastic Containers = 2; HDPE Plastic = 3; Mixed Plastic = 4; unknown = 255.

## Reproduce builds and tests

Use Anchor CLI 0.31.1, the Solana CLI, Rust stable, and Node.js 24. Official installation instructions: https://solana.com/docs/intro/installation.

```sh
cd solana-verification
npm ci
npm run build
npm run typecheck
npm test
```

The workspace manifest, IDL feature, dependency lockfiles, and Node typings are included. The build uses stable Rust for IDL generation. Tests default to a fresh local validator, where airdrops are local test funds. They cover initialization, authority restrictions, recording, duplicate prevention, invalid weight, and unauthorized signers.

`Anchor.toml` points at the deployment wallet in `wallets/devnet-authority.json`. Private wallets and `target/` are ignored by Git. Securely back up both the authority wallet and `target/deploy/bottle_up_receipts-keypair.json`; do not paste their contents into chat or source control. This program permits only its compiled deployment authority to initialize config. Reusing it with a new wallet requires explicitly updating that public authority in Rust and rebuilding.

The original deployment workstation installation lives under `/private/tmp/bottleup-tools`. If necessary, set `PATH` to include its root, `solana-release/bin`, and `cargo/bin`, set `CARGO_HOME` to its `cargo` directory, and set `RUSTUP_HOME` to its `rustup` directory. These temporary tools may need reinstalling after system cleanup.

## Contributor setup without deployment keys

A clone does not include the private authority wallet or program keypair. The Rust program currently permits initialization only by the compiled public authority. Merely generating a wallet will therefore not make the existing tests pass.

For a separate local development instance, create a local test wallet, set `Anchor.toml` to its path, and update the public initialization-authority constant in `programs/bottle_up_receipts/src/lib.rs` to that wallet's public-key bytes. Generate a separate program keypair, synchronize its public program ID across Rust and `Anchor.toml`, then rebuild before running local-validator tests. These changes describe a different instance; do not overwrite the documented shared Devnet identity or commit private key files.

For maintenance of the existing deployed instance, the deployment owner must provide access through a secure key-management process. Mainnet needs a separate deployment plan; the current Edge Function deliberately rejects other networks.

## Deploy and initialize

Check the wallet's Devnet balance before deploying. Free test SOL is available from https://faucet.solana.com. Never fund this test flow with real SOL.

```sh
solana program deploy target/deploy/bottle_up_receipts.so \
  --program-id target/deploy/bottle_up_receipts-keypair.json \
  --keypair wallets/devnet-authority.json --url devnet --use-rpc
npm run initialize
```

### Upgrading an existing deployment (e.g. adding `bottle_count`)

The program is not marked immutable and the deployment wallet still holds the upgrade authority, so an account-layout change like adding `bottle_count` does not need a new program ID or a new `wallets/devnet-authority.json`. Rebuild and redeploy with the **same** command as a fresh deploy — `solana program deploy` upgrades in place when the program ID already exists on-chain:

```sh
anchor build
solana program deploy target/deploy/bottle_up_receipts.so \
  --program-id target/deploy/bottle_up_receipts-keypair.json \
  --keypair wallets/devnet-authority.json --url devnet --use-rpc
```

`npm run initialize` does **not** need to run again — `ReceiptConfig` is unchanged, so the existing `config` PDA stays valid. Any receipt already recorded under the old 123-byte layout stays exactly as it was written (receipts are `init`-only, never updated); only receipts recorded *after* the upgrade get the new 127-byte layout with `bottle_count`. Since this project has not yet recorded a real (non-synthetic) receipt, there's no backward-compatibility concern to design around.

Initialization is idempotent for the correct authority and refuses another authority's configuration. The upgrade authority remains under the deployment wallet; the program is not marked immutable.

## Supabase integration

The additive migration at `migrations/202610120001_add_solana_receipt_fields.sql` is applied to BottleUP. It adds receipt address/signature/status/error/timestamp fields and unique indexes without resetting pickups or points. Client roles cannot edit these proof fields.

The deployed Edge Function authenticates the session and checks the persisted admin role before signing. It requires a VERIFIED pickup with valid weight and timestamp. It checks config ownership and authority, confirms transaction success, then validates the exact resulting receipt. Retries validate and reuse an existing receipt and recover its transaction signature from the chain. Errors retain verification/points and leave a retryable receipt status. The function also updates older `onchain_*` fields for UI compatibility.

Configured server secrets are `SOLANA_RPC_URL`, `SOLANA_RECEIPT_PROGRAM_ID`, and `BOTTLEUP_SOLANA_AUTHORITY_SECRET`. Supabase supplies its own database/API credentials. Keep JWT verification enabled. The signer is never bundled into the frontend.

## Live test

`node scripts/live-receipt-test.mjs` uses two temporary synthetic accounts, a short-lived admin role, and a labelled pickup fixture. It deliberately does not issue points or claim real recycling. It checks anonymous/user/unverified rejection, receipt creation, retry identity, database persistence, and recovery after a missing database signature. It removes only those fixtures afterward, with a recovery manifest if cleanup fails.

Run live tests only with explicit project-owner approval. Set `BOTTLEUP_TEST_KEYS_FILE` to a private JSON file produced by `supabase projects api-keys --output json`. Keys and passwords are not printed or committed. `--configuration-only` checks authenticated integration before program deployment and expects the undeployed program to fail, rather than claiming a completed receipt.

Current evidence and remaining submission work: [submission readiness](../docs/submission-readiness.md).

### Upload recovery

The first bulk upload hit public RPC rate limits. The authority-owned buffer was resumed using `scripts/resume-buffer.mjs <buffer-address>`, which verifies ownership/size, writes only differing chunks at a limited rate, confirms each write over HTTP, and checks exact equality with the compiled binary. It is Devnet-only. The final program was deployed from the completed buffer.

Successful deployment and live test evidence is recorded in `deployment/devnet-test-results.json`.
