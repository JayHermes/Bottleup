# Deployment and operations

The intended public application is [usebottleup.xyz](https://usebottleup.xyz). The frontend is hosted on Vercel, the backend uses Supabase, and the receipt program runs on Solana Devnet. A private fallback demo is not the submission address.

## Frontend

The root [`vercel.json`](../vercel.json) defines:

| Setting | Value |
| --- | --- |
| Install command | `cd bottle-up-mvp && npm install` |
| Build command | `cd bottle-up-mvp && npm run build` |
| Output directory | `bottle-up-mvp/dist` |
| Public environment | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy `VITE_SUPABASE_ANON_KEY`) |

Set the environment variables in the hosting project before building. Vite substitutes them at build time; changing a variable requires a new build. Preserve the configured security headers, including allowed Supabase connections, OpenStreetMap tile images, and geolocation permissions.

GitHub Actions builds the frontend on pushes and pull requests to main. It currently uses Node.js 20 and placeholder public credentials, and **does not run `npm test` or deploy the Solana program**. Use Node.js 24 for the full local suite.

## Backend changes

For a new project, follow [Getting started](getting-started.md). For the existing project, inspect migration history and apply only reviewed incremental changes. Never replay the fresh-project bootstrap in production.

The receipt migration lives outside the application migration folder at [`solana-verification/migrations/202610120001_add_solana_receipt_fields.sql`](../solana-verification/migrations/202610120001_add_solana_receipt_fields.sql). Do not assume a generic app migration command will discover it.

Deploy the `record-recycling-receipt` Edge Function from `bottle-up-mvp/supabase/functions/record-recycling-receipt/`, including both `index.ts` and `receipt-core.mjs`. Keep JWT verification enabled. The function's server configuration is:

| Variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Devnet RPC endpoint |
| `SOLANA_RECEIPT_PROGRAM_ID` | Deployed receipt program address |
| `BOTTLEUP_SOLANA_AUTHORITY_SECRET` | Private 64-byte signing key as a JSON array |
| Supabase-provided credentials | Backend database/API access; keep server-side |

Store signing material in Supabase server secrets. Do not put it in a `VITE_*` variable, committed file, screenshot, or public deployment log. The function checks the Devnet genesis hash, so pointing it at Mainnet alone will not enable production receipts.

For program builds, deployment identity, initialization, and upload recovery, use the [Solana guide](../solana-verification/README.md). Back up the authority wallet and program keypair securely. Both are ignored by Git and are not recreated by cloning this repository.

## Release verification

Run the [testing checklist](testing.md), then confirm sign-in, photo access, a normal collector/admin pickup, points history, and Explorer links on the deployed site. A green frontend build does not verify database policies, configured server secrets, or blockchain deployment.

Inspect failed receipt status before retrying. Verification and points remain valid if a receipt fails. A confirmed receipt retry must retain the same account; do not reset points or manually invent a transaction signature.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing backend configuration | Project API URL/public key, hosting environment, and whether the app was rebuilt |
| Login or recovery link fails | Supabase Auth settings, allowed origin/redirect URLs, and email-link expiry |
| Map does not load | Internet connection, tile requests, hosting CSP, and Leaflet styles |
| GPS denied or times out | HTTPS, browser permission, device location settings; try manual pin selection |
| Photo cannot be read | Private bucket, object path, owner/assigned collector/admin policy, signed URL expiry |
| Pickup cannot advance | Persisted role, assignment, current status, and database RPC error |
| Receipt fails | Admin session, VERIFIED row, valid weight/date, server secrets, signer balance, RPC availability, program config |
| Explorer appears empty | The link/network must select Devnet |
| Points differ from history | Use the reconciliation query in the points guide; do not edit balances or ledger entries manually |

OpenStreetMap public tiles need visible attribution and must follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Review the provider before substantially increasing traffic.

## Verification helper ambiguity fix — 12 October 2026

The live project contained six- and seven-argument `bottleup_private.post_points` overloads with overlapping defaults. Calls from verification, redemption, and refund could fail with “function … is not unique.” The additive `20261012150615_disambiguate_post_points.sql` migration renames the legacy seven-argument helper to `post_points_with_rate`, retaining its body, ownership, and permissions. Current application callers continue using the six-argument helper. Fresh databases need no rename.

The migration was applied to BottleUP. A transaction-scoped live test under the authenticated admin role verified a collected pickup, credited the user and collector at the live configured rates, and confirmed that a repeat verification did not credit twice. All fixtures were rolled back. The local regression test also covers redemption/refund and migration replay.

The live project currently uses 70 user points and 25 collector points per kilogram, whereas the original bootstrap and earlier product documentation describe 100 user points per kilogram. This repair preserves deployed rates. Reconcile product copy and the reproducible schema with the team's chosen rate in a separate change.
