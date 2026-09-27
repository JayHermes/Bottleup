# BottleUp points system

Implemented 28 September 2026 in BottleUP (`sdubpqggmhadoqmjrgaf`). Supabase assigned migration version `20260927234455`; the CLI-created local file was renamed to that observed version so deployment history agrees.

## Rules

- 100 integer points per verified kilogram, preserving the existing product rate. Collectors record 0.01–20,000 kg with at most two decimals; only admins verify. Estimates never earn points.
- Verification credits a pickup once. The original weight and rate are recorded alongside the credit.
- The database owns reward prices and availability. The existing catalog remains Free Pickup / 300 points, ₦1,000 Airtime / 500 points, and ₦2,000 Shopping Voucher / 1,000 points. These are existing business choices, not claims that research validated their profitability.
- Redemption reserves points immediately. Fulfilment does not debit again; rejection refunds once. Decisions are terminal. Fulfilment is manual, not an airtime or bank payout integration.
- Points have no cash-withdrawal facility. No expiry or automatic promotional grants were introduced.

## Architecture and research

PostgreSQL owns every state change. The append-only `points_ledger` records credits, debits, refunds and any balance present at migration cutover. `profiles.points` is a cached balance updated in the same transaction. Unique source constraints, nonnegative balances and atomic guarded updates enforce the accounting invariants.

Verification locks the pickup, then updates the balance. Decisions lock the redemption, then update the balance. New reward requests lock the user's balance with `FOR NO KEY UPDATE`, check their request key, read the active catalog entry, then insert the redemption and debit. They do not lock existing redemption rows. This avoids a conflicting lock order with decisions and prevents overspending across concurrent requests. Same-key retries return the prior result; reuse for a different reward fails. The frontend retains uncertain request keys in session storage until success.

These choices follow [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS), [unique constraints](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS), [Supabase database functions](https://supabase.com/docs/guides/database/functions), and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Privileged implementations live in a non-exposed schema; public endpoints are invoker wrappers. Internal ledger mutation is not executable by API roles. Direct browser writes to balances, roles, pickup statuses, redemptions, catalog prices and history are revoked, including historical column privileges.

[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) requires publication membership. The migration adds profiles, pickups, redemptions, notifications and ledger. Balance refresh also runs after redemption, subscription reconnection, focus and every 30 seconds while visible. A profile read failure displays an error rather than a zero balance. Wallet history supports loading, errors, retries and loading more entries.

## Verification evidence

- `npm --prefix bottle-up-mvp test`: nine passing tests, including SQL role/ownership checks, illegal writes, missing/invalid weight, pickup lifecycle, repeated verification, server pricing, idempotency mismatch, insufficient funds, terminal fulfilment/refund decisions, immutable history and ledger reconciliation. Bank and photo policy regression tests also pass, as does a fresh-project bootstrap test.
- PostgreSQL 17 container: eight simultaneous same-key requests produced one redemption/debit; eight distinct requests competing for a single remaining reward's balance produced one success. Balance and ledger reconciled to zero.
- Live Supabase: transaction-scoped synthetic user, collector and admin fixtures exercised the full pickup → verification → redemption → rejection flow under the authenticated role. Repeated commands, insufficient funds, direct-balance-write rejection and cross-user ledger isolation passed. The transaction rolled back; no synthetic users, points or notifications remain.
- Production migration applied successfully. Required tables are in the realtime publication. Existing accounts and pickups are preserved.
- Production frontend build passes. Browser-based visual verification was blocked by the browser tool's URL policy; no authenticated browser E2E success is claimed.

## Operations

The existing project already has this migration: do not rerun `schema.sql` against it. `supabase/schema.sql` is a fresh-project bootstrap with the current points upgrade included. `tests/points-baseline.sql` is the schema-only pre-upgrade fixture, not a production setup script.

Run the regular suite with `npm test` inside `bottle-up-mvp`. For real concurrency tests, create an isolated `postgres:17-alpine` container named `bottleup-points-test`, load `tests/points-baseline.sql`, apply the points migration using `psql --single-transaction`, then run `npm run test:concurrency`. The test deliberately uses only that local container and requires a fresh fixture each run.

Reconciliation (must return zero rows):

```sql
select p.id, p.points, coalesce(sum(l.points), 0) as ledger_points
from public.profiles p
left join public.points_ledger l on l.user_id = p.id
group by p.id, p.points
having p.points <> coalesce(sum(l.points), 0);
```

Do not restore the old redemption/verification functions as a rollback: that would bypass the ledger. Prefer a forward fix; temporarily set a catalog entry inactive to pause new redemptions without disturbing existing requests. Never edit ledger entries or balances directly. Historical source references intentionally prevent deleting accounting records casually; account erasure needs a separate retention-aware workflow.

Security advisors now report only two intentional authenticated role-predicate endpoints, two unused RLS-locked tables without policies, and the pre-existing disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The role predicates reveal only the caller's own role. These are not points-write endpoints. No claim of a complete application security audit is made.
