# BottleUp Solana receipts (Devnet)

BottleUp records one receipt per verified pickup at a deterministic PDA: `["receipt", sha256(pickup_uuid)]`. Receipts hold the pickup hash, verified grams, material code, evidence-reference hash, timestamp, and verifier. Addresses, names, photographs, and contact details stay off-chain. A receipt proves an authorized attestation, not independent proof of physical recycling.

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

The installation used for this checkout lives under `/private/tmp/bottleup-tools`. If necessary, set `PATH` to include its root, `solana-release/bin`, and `cargo/bin`, set `CARGO_HOME` to its `cargo` directory, and set `RUSTUP_HOME` to its `rustup` directory. These temporary tools may need reinstalling after system cleanup.

## Deploy and initialize

Check the wallet's Devnet balance before deploying. Free test SOL is available from https://faucet.solana.com. Never fund this test flow with real SOL.

```sh
solana program deploy target/deploy/bottle_up_receipts.so \
  --program-id target/deploy/bottle_up_receipts-keypair.json \
  --keypair wallets/devnet-authority.json --url devnet --use-rpc
npm run initialize
```

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
