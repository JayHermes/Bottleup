# P0 — Make BottleUp pickup verification and points reliable before launch

## Outcome
A user can list their own pickups, see an accurate balance, earn points exactly once after an admin verifies collected weight, redeem only valid rewards, and receive balance updates without a page reload. Users cannot read another user's private records, change roles, manufacture points, or spend the same balance twice.

Implementation was explicitly authorized on 28 September 2026. The points migration is now applied to BottleUP. See [implementation and verification evidence](../points-system.md) for the delivered scope, tests and operational limits. The audit below records the pre-migration state.

## Confirmed live state (28 September 2026)
Project: BottleUP, `sdubpqggmhadoqmjrgaf`.
- Profiles and balances exist; all eight current balances were zero at inspection.
- An authenticated ordinary-user SQL test could read one own profile/balance and zero other profiles. Profiles RLS is enabled. This proves this read case, not all authorization paths.
- Five pickups existed: three AVAILABLE and two ON_THE_WAY. No verified pickups or reward transactions existed.
- The frontend calls `accept_pickup`, `start_on_the_way`, `collect_pickup`, `verify_pickup`, profile-management and admin-decision RPCs that are missing from the live database.
- The old verification trigger awards 100 points/kg. Its end-to-end operation through the current app is unverified because the verification RPC is absent.
- `redeem_reward` accepts a client-supplied cost, reads the balance without locking, and updates points. `protect_profile_fields` rejects points changes for non-admin JWT identities, including that legitimate redemption path. These definitions require replacement and transactional tests.
- No tables were listed in the `supabase_realtime` publication. Frontend subscriptions therefore do not establish working live updates.
- The bank_accounts table was subsequently created with owner-only RLS; cash payouts remain out of scope.

## Architecture decision
Keep React + Supabase Auth + PostgreSQL. Use database transactions as the authority for the points economy. Do not add microservices, queues, or a second balance service for this launch.

### Authoritative points ledger
Use an append-only points ledger for earned credits, redemption debits and refunds. Each entry records user, signed integer amount, operation type, source reference, timestamp and a unique idempotency key. Credits use a unique pickup-verification reference; debits use a redemption reference; refunds use a unique reversal reference. Never overwrite issued history; corrections are explicit compensating entries.

Treat `profiles.points` as a cached available balance, maintained in the same transaction as ledger entries. Retain it for compatibility with the existing UI. Enforce nonnegative balances and reconcile it against the ledger. Capture the verified weight and points rate used in the award so later rate changes cannot rewrite history. For existing nonzero balances without history, introduce an audited opening entry after reconciliation; do not invent historical pickups.

### Narrow commands and atomic state transitions
Provide the exact RPC signatures used by the frontend, or update caller and server together. Validate authenticated identity and stored role inside every privileged command.
- Claim pickup: collector/admin only; atomically claim only AVAILABLE, with a row lock or conditional UPDATE.
- Start journey / collect: assigned collector or admin only; enforce valid transitions and positive, bounded actual weight. Reject changes to requester identity and verified weight after verification.
- Verify: admin only; lock pickup then affected balance, require COLLECTED and valid recorded weight, transition once, insert one ledger credit and update balance atomically. Duplicate/retried verification must not issue a second credit.
- Redeem: accept a reward identifier and request idempotency key. Read active price from a server-owned reward catalog, never trust client cost. Lock the user's balance; validate availability and sufficient funds; insert redemption and ledger debit, and update balance in one transaction.
- Reject redemption: admin only; lock redemption then balance, transition only from pending, refund exactly once with a linked reversal entry.
- Fulfil redemption: admin only; transition only from pending; record decision metadata; never refund a fulfilled redemption automatically.

Use a documented consistent lock order across commands. Any failure rolls back status, balance, ledger and notification together. Do not install a new award trigger alongside the old one: replace the relevant path in the same migration to prevent double credits.

### Authorization boundary
RLS governs reads; table/column privileges and narrow RPCs govern writes.
- Users read only their own profile, balance, pickups, redemptions, ledger and bank details.
- Collectors see only the pickup information needed for available/assigned work; never other users' bank details or wallets.
- Admin privileges are stored in protected database fields, not user-editable signup metadata.
- Revoke direct browser writes to points, roles, verification fields, ledger and redemption decisions. Remove permissive old policies after mapping their callers.
- Replace the conflicting profile protection mechanism with explicit write privileges plus validated commands. Do not merely disable protection or add a client-settable bypass flag.
- Keep internal privileged helpers in a non-exposed schema with fixed search paths. If public RPC wrappers need SECURITY DEFINER, grant execute only to intended authenticated roles, validate permissions inside, and use schema-qualified objects. Signed-in access alone is insufficient authorization.
- Retain owner-only bank RLS. Do not place service keys in the browser.

### Reads and frontend refresh
Expose safe own-account balance and transaction reads. Initially load the authoritative value; distinguish loading/error from a genuine zero balance. After a successful mutation, re-fetch balance and affected lists even if Realtime is delayed. Subscribe to own profile/balance changes through RLS-protected Realtime, clean up subscriptions and re-fetch on reconnect/focus. Realtime is an invalidation signal, not the accounting authority.

List screens need loading, empty, error/retry and pagination states. Keep permanent recycled weight based on verified pickups, not the spendable balance. Distinguish available points, pending redemption points and issued/reversed ledger entries; never imply withdrawable cash.

## Implementation order
1. Export current schema, functions, policies, grants, triggers and publication configuration; compare with every frontend call. Record baseline counts and balance totals. Use staging/test fixtures before touching live records.
2. Prepare a forward migration preserving all existing users/pickups: ledger/catalog constraints, command functions, grants/RLS, replacement of conflicting triggers and policies, and required realtime publication membership. Do not rerun the entire repository schema blindly.
3. Test schema and commands with normal-user, different-user, collector, admin and anonymous identities, including concurrent requests and transaction rollback.
4. Apply the reviewed migration, verify grants/functions/constraints, run advisors, and validate using isolated test accounts. Do not award test credits to real users or verify their pickups.
5. Connect the app to the correct production project; verify deployed frontend build and configuration. Test signed-in production flows, not `/dashboard-preview`, which intentionally uses sample data.
6. Reconcile the ledger and balances; record evidence and release only after the checks below pass.

## Acceptance checks — required launch evidence
- User A sees their actual balance and listings; cannot read or mutate User B's records through direct API calls. Anonymous reads fail.
- A normal user cannot change points/role or verify a pickup. A collector cannot verify or alter another collector's assigned pickup.
- Admin verification of 2.5 kg awards exactly 250 points and one ledger credit. Retrying, concurrent verification and repeated status updates cannot award again.
- Invalid/null/negative weights, illegal transitions and forged ownership are rejected.
- Valid redemption debits once. Insufficient funds, inactive/unknown reward, zero/negative/forged cost and duplicate submissions cannot create invalid rewards or balances.
- Two simultaneous redemptions cannot overspend. Failed operations leave no partial balance, ledger, notification or status change.
- Rejection refunds once; repeated decisions and fulfilled-redemption rejection cannot issue an extra refund.
- Profile points equal the ledger sum for every user, with no negative balances.
- A logged-in second session reflects verification/redemption; reconnect and refresh recover accurate state. A failed balance query shows an error, not 0.
- Existing account signup, profile reads, pickup listing and bank-detail access still work after migration.

## Release and recovery
This ticket is P0 for advertising an operational earn/redeem points flow. A working zero-balance display alone does not meet the launch gate. If tests cannot finish before launch, explicitly disable earning/redemption actions and communicate limited availability rather than showing success.

Keep a database backup/recovery point and the previous deployment reference. Prefer forward corrective migrations; never roll back by dropping the ledger or deleting user history. Disable affected commands if reconciliation fails, retain records, and repair through reviewed compensating entries. Log operation IDs and failures without exposing account numbers or secrets.

## Deliverables
Reviewed migration and rollback/recovery notes; frontend RPC/read-state changes; automated authorization/concurrency/accounting tests; signed-in smoke-test evidence; reconciliation output; explicit launch approval after all acceptance checks pass.
