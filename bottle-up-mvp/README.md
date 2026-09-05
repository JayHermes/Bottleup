# Bottle Up MVP

A mobile-friendly MVP for coordinating plastic pickup, collector fulfillment, recycling verification, and user rewards.

## Included
- User pickup request flow
- Collector acceptance + collection flow
- Admin verification + reward flow
- Responsive UI
- Supabase-ready database schema
- Mock data so the interface works before backend connection

## Run locally
```bash
npm install
npm run dev
```

## Connect Supabase
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env`.
4. Add your project URL and anon key.
5. Replace the temporary in-memory request state in `src/main.jsx` with Supabase queries.

## Current reward assumption
The demo awards **100 points per verified kilogram**. This is deliberately a placeholder; the business model should determine the final conversion and redemption value.

## Next engineering milestone
Wire the UI to Supabase Auth + database, add image upload, map/location selection, and role-based access policies for collectors/admins.
