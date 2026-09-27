# BottleUp

React + Supabase app for plastic pickups, collector fulfilment, admin verification and recycling rewards.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

Set the Supabase URL and publishable/anon key using `.env.example`. Never put a service-role key in frontend environment variables. `/dashboard-preview` is a development-only design preview; its sample data is not a working account.

## Database

Production BottleUP already has the points migration. Do not run the bootstrap schema against production. For a new, empty Supabase project, run `supabase/schema.sql` in the SQL editor; it includes private photo storage, bank-detail ownership policies and the points ledger.

See [points architecture, research and verification](../docs/points-system.md). The system credits 100 points per admin-verified kilogram, reads reward prices from the server, prevents double spending/repeated credits, refunds rejected rewards once, and displays balance/history. Reward fulfilment remains a manual team operation; cash payouts are not implemented.
