# Architecture

BottleUp separates the user interface, database accounting, and blockchain signing. The browser uses a public Supabase key with the signed-in user's session. PostgreSQL enforces ownership and role permissions; the server-side receipt function alone holds the Solana signer.

## Components

| Component | Responsibility | Source |
| --- | --- | --- |
| React + Vite | Landing, auth, user/collector/admin dashboards | `bottle-up-mvp/src/main.jsx`, `src/components/` |
| Supabase Auth | Accounts, sessions, password recovery | `bottle-up-mvp/src/lib/supabase.js` |
| PostgreSQL + RLS | Pickup transitions, permissions, balances, rewards | `bottle-up-mvp/supabase/schema.sql`, `supabase/migrations/` |
| Supabase Storage | Private pickup photos and participant access | `bottle-up-mvp/supabase/pickup-photo-storage.sql` |
| Leaflet + OpenStreetMap | Pickup pins and collector location snapshots | `bottle-up-mvp/src/PickupsMap.jsx`, `src/lib/location.js` |
| Supabase Edge Function | Admin authorization, receipt signing, confirmation and recovery | `bottle-up-mvp/supabase/functions/record-recycling-receipt/` |
| Anchor program | Authorized receipt creation and duplicate prevention | `solana-verification/programs/bottle_up_receipts/src/lib.rs` |

Paths in the source column are relative to the repository root, except abbreviated paths within the same application directory.

## Roles and pickup lifecycle

Users create requests, view their pickups, and request rewards. Approved collectors accept pickups and enter collected weight. Administrators approve collector applications, verify collection, and decide reward fulfilment.

```text
AVAILABLE → ACCEPTED → ON_THE_WAY → COLLECTED → VERIFIED
```

`CANCELLED` is also a supported terminal status. Database functions validate which transitions each caller may make. The frontend calls `accept_pickup`, `start_on_the_way`, `collect_pickup`, and `verify_pickup`; hiding a button is not the authorization boundary.

Verification credits points once, using actual collected weight. The append-only points ledger and cached profile balance change atomically. Redemption reserves points immediately; rejection refunds once. See [points-system.md](points-system.md) for locking and accounting invariants.

## Receipt flow

1. The admin verifies a pickup through the database RPC.
2. The frontend requests `record-recycling-receipt` with the pickup UUID.
3. The function validates the session, persisted admin role, VERIFIED status, weight, timestamp, Devnet genesis hash, and configured authority.
4. It derives the receipt address from `['receipt', sha256(pickup_uuid)]`, signs the instruction, and confirms it.
5. It validates the on-chain account's owner and exact payload before saving the proof address/signature in PostgreSQL.

Receipt failure does not undo verification or earned points. Administrators can retry. A retry checks an existing receipt and recovers the transaction signature when necessary, rather than creating a second receipt.

The stored fields are `solana_receipt_address`, `solana_tx_signature`, `solana_receipt_status`, `solana_receipt_error`, and `solana_recorded_at`. The function also maintains older `onchain_*` fields for compatibility. Clients cannot directly update proof fields.

## Location and photo privacy

GPS is a browser permission request, requiring HTTPS or localhost. Users can select a pin manually when GPS is unavailable. A written landmark without coordinates cannot be plotted or ranked by distance. Collector tracking represents the last position explicitly shared during pickup actions.

Pickup photos use the private `pickup-photos` bucket. Owners, assigned collectors, and admins can read attached photos through short-lived signed URLs. The browser re-encodes supported JPEG/PNG/WebP files up to 8 MB to JPEG, removes metadata, and limits dimensions to 1600 pixels. Bank details have account-owner access rules and are manually supplied.

The blockchain holds pickup/evidence hashes, weight in grams, material code, timestamp, and verifier. It does not hold the written location, phone number, name, or photo. An evidence hash is a reference fingerprint, not a public evidence upload or independent verification of the physical collection.

## Network and trust boundaries

The current program and function use **Solana Devnet**. Explorer links explicitly select Devnet. Test SOL has no monetary value, and Devnet records are unsuitable as a guarantee of permanent production storage. Mainnet deployment is a separate release requiring real SOL, deployment/key planning, and coordinated network changes.

The signing authority and upgrade authority remain trusted components. The program accepts authorized attestations; it does not measure recycling itself. Private key files are excluded from Git and must be backed up securely by the deployment owner.
