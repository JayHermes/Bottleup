# Bottle Up MVP

A mobile-friendly MVP for coordinating plastic pickup, collector fulfillment, recycling verification, and user rewards.

## What's included
- User pickup request flow (photo upload, location, tracking)
- Collector acceptance + collection flow (nearest-first + map)
- Admin verification, collector approvals, and reward fulfilment
- Role-based UI (`user` / `collector` / `admin`) backed by Supabase Auth + RLS
- Mapbox geocoding and pickup maps
- Realtime updates for points, pickups, and notifications

## Project layout
```
src/
  main.jsx              # entry
  App.jsx               # auth gate + routing between landing / app
  AppShell.jsx          # signed-in shell, role screens, pickup RPCs
  constants.js          # rewards, tiers, status labels
  components/           # shared UI + PickupModal
  screens/              # Landing, Auth, User, Collector, Admin
  hooks/                # useAuth, pickups, notifications, redemptions
  lib/                  # supabase, mapbox, geo, image helpers
supabase/schema.sql     # tables, RLS, RPCs, triggers
```

## Run locally
```bash
npm install
cp .env.example .env
# fill VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY), VITE_MAPBOX_TOKEN
npm run dev
```

## Connect Supabase
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env` and add your project URL + browser-safe key.
4. Ensure the private `pickup-photos` storage bucket exists (created by the schema).

## Rewards
The pilot awards **100 points per verified kilogram** (see `bottleup_economics` / `POINTS_PER_KG`). This is a placeholder; final conversion should follow the business model.

## Next engineering milestones
- Partner-backed reward fulfilment
- Saved addresses / pickup preferences
- Stronger collector routing (beyond haversine sort)
- Split large screen modules further as features grow
