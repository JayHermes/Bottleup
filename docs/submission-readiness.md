# BottleUp submission readiness — 12 October 2026

## Confirmed technical work

- Latest main pulled; PR #3 merged with the map fixes preserved.
- React production build passes.
- 13 automated app/database/receipt tests pass, including pickup/points permissions, hash encoding, receipt recovery validation, endpoint authorization and proof-field protections.
- Solana binary and IDL compile. Generated TypeScript interface checks pass.
- Three local-validator tests pass: unauthorized initialization denied; one receipt with duplicate prevention; zero-weight and unauthorized receipts denied.
- Live BottleUP receipt migration is applied. Authenticated clients cannot write proof fields.
- Receipt Edge Function is deployed with JWT checking and server-side Devnet signing secrets.
- Live temporary-fixture tests return 401 for anonymous requests, 403 for ordinary users, and 409 for unverified pickups. Temporary accounts/pickup were cleaned up; no points were awarded.

## Deployment evidence

Program ID: `F8VR44MDbcA6ZFNaz5UerqZLnbVwT7DPKuqNaxLPd6C`.
Authority: `5a65byZRjdDsn3PWZW7a9TeuEVEwZSpLdh1PaPH2kqaF`.
Compiled binary SHA-256: `201bea60a08faef988400cd399b191c895f31e4e10f1cc94b42d035977af016d`.

Devnet deployment and initialization are complete. The live test created a confirmed receipt, reused the same address/signature on retry, and recovered a deliberately cleared database signature. All synthetic fixtures were removed; no points were awarded.

- [Deployed program](https://explorer.solana.com/address/F8VR44MDbcA6ZFNaz5UerqZLnbVwT7DPKuqNaxLPd6C?cluster=devnet)
- [Program deployment transaction](https://explorer.solana.com/tx/5fj5Yk5H1SuQoWwbXEZLUNEsYin841g7iVNeDs4PSgAn1aTZfZP4PifubzND1eHSGibQroQR5tYLuyw8gFDMhmyc?cluster=devnet)
- [Test receipt](https://explorer.solana.com/address/vDqpfUS2G1xpwWi6JT7RANFNCZzckecbjMdPVjuFvnx?cluster=devnet)
- [Test receipt transaction](https://explorer.solana.com/tx/5LYFvaiKdE7ycMQJpWMC7teGb1KcxDQhE1KejfAZ1W1yX4vxafwjhca2xHQigpkXRXbJt8imnfWGLmmAQEsa9Ffe?cluster=devnet)
- Machine-readable evidence: `solana-verification/deployment/devnet-test-results.json`.

## Main website

The submission URL is https://usebottleup.xyz (redirects to www). Its landing page, ordinary-user sign-in, dashboard, Leaflet/OpenStreetMap tile loading, and manual pickup-pin selection were verified in the browser. The disposable browser-test account was signed out and removed. No pickup was submitted or points issued during that browser test. The subsequent Vercel deployment succeeded, and the team confirmed it deployed. These browser checks are dated evidence; the complete live workflow still needs the checks below.

A separate configured fallback is deployed at https://bottleup-submission.sacredtiger3.chatgpt.site. It stays owner-private at the user's request and is not the submission URL.

## Submission materials to confirm

The team has not confirmed the competition. A likely match is [Colosseum Crypto World's Fair](https://colosseum.com/worldsfair), with a Solana track. Its [official rules](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf) give a deadline of 12 October 2026, 11:59 pm Pacific, equivalent to **13 October 2026, 7:59 am Lagos time**. Verify the chosen competition in the team's account.

According to [Colosseum's submission FAQ](https://colosseum.com/hackathon), prepare:

- Team registration, members/backgrounds/location, product name/description/logo and blockchain/tools list.
- Accessible GitHub repository and product link.
- A 2–3 minute presentation video and a product-demo video of at most 3 minutes.
- Go-to-market strategy, demand validation and distribution plans.
- Disclosure of pre-existing development. This repository's history starts on 5 September, before the 14 September competition start; distinguish prior work from work completed during the event.

These account details, videos, and the actual submission have not been verified or uploaded. Existing traction notes under `untitled/` are an early snapshot and should not be presented as current results without checking them.

## Other release checks

- Manual pickup-pin selection passed on the main site. Real phone GPS still needs a device check.
- Signed-in photo upload/read and normal user→collector→admin flow need a live demo check. Their database/policy behavior is covered by automated tests.
- Cash payouts are not implemented; reward fulfilment is manual.
- Supabase advisors show a mutable search path on `notify_pickup_status_change`, existing authenticated role-helper warnings, two locked unused tables without policies, and disabled leaked-password protection. These are separate from the receipt migration; review them before a broader production release.
- Protect/back up the ignored deployment keys. Do not include secrets in the demo or repository.
