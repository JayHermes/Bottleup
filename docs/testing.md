# Testing

## Application suite

Use Node.js 24. From the repository root:

```sh
npm --prefix bottle-up-mvp ci
npm --prefix bottle-up-mvp test
npm --prefix bottle-up-mvp run build
```

The configured suite covers bank-account ownership, private photo policies, pickup/points accounting, location helpers, Solana proof-field permissions, receipt encoding, and receipt-handler authorization. SQL tests use isolated PGlite fixtures. These tests do not migrate production or create real user pickups.

GitHub Actions currently checks only the frontend build. Run the suite locally before a release; do not treat the CI badge as test-suite evidence.

For the separate PostgreSQL concurrency test, follow the isolated container/fixture steps in [points-system.md](points-system.md), then run `npm run test:concurrency` from `bottle-up-mvp`. It requires the dedicated local test container and is not part of the default suite.

## Solana program

With the prerequisites and wallet configured as described in the [Solana guide](../solana-verification/README.md):

```sh
cd solana-verification
npm ci
npm run build
npm run typecheck
npm test
```

Tests use a fresh local validator and cover unauthorized initialization, authorized receipt creation, duplicate rejection, invalid weight, and unauthorized signing. This checkout's compiled authority is tied to the deployment wallet. A new contributor must use a separate local test authority and update its public identity/configuration before testing; private deployment keys are not in Git. See the guide's contributor instructions.

## Live receipt test

[`live-receipt-test.mjs`](../solana-verification/scripts/live-receipt-test.mjs) is a privileged integration test. It creates temporary synthetic accounts, temporarily assigns an admin role, creates a labelled pickup, marks it verified without awarding points, signs a Devnet receipt, tests retry recovery, and removes the fixtures.

Use it only with explicit project-owner approval and the private key-file setup described in the Solana guide. A blockchain test receipt remains on Devnet after database fixtures are deleted. This test checks the receipt integration; it does not replace the normal collector and admin UI walkthrough.

## Manual release checklist

Use clearly labelled test data and accounts with the intended roles. Check each workflow on the actual deployment:

- Sign up, sign in, sign out, and recover a password through its email link.
- On a real phone, allow and deny GPS; select a manual map pin; confirm the written landmark is retained.
- Upload a supported photo and verify participant access; check that an unrelated account cannot read it.
- Schedule a pickup, approve/use a collector, accept it, mark on the way, record actual weight, and verify as admin.
- Confirm one points credit and matching history; retrying verification must not issue a second credit.
- Open the receipt in Devnet Explorer and retry a failed recording without duplicating it.
- Request a catalog reward and check the reserved balance; reject it and confirm one refund.
- Save, edit, and remove bank details; another user must not see them.

Do not mark a test reward fulfilled unless the test procedure accounts for any manual delivery. Clean up only the labelled fixtures, respecting ledger and foreign-key retention rules.

For the dated results and remaining checks, see [submission readiness](submission-readiness.md) and [Devnet evidence](../solana-verification/deployment/devnet-test-results.json).
