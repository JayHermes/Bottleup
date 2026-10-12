# BottleUp web application

React and Vite frontend backed by Supabase Auth, PostgreSQL, private photo storage, and a Solana receipt Edge Function.

From this directory, with Node.js 24:

```sh
npm ci
cp .env.example .env
# Set your Supabase URL and publishable key.
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

`npm run preview` serves the production build locally. `/dashboard-preview` is a development-only design view with labelled sample data; it cannot save pickups, bank details, or reward requests.

See the [repository README](../README.md), [setup guide](../docs/getting-started.md), [architecture](../docs/architecture.md), and [testing guide](../docs/testing.md).

`supabase/schema.sql` bootstraps a **new, empty project only**. Do not run it against the existing BottleUP database. Frontend `VITE_*` variables must contain only the project URL and public publishable/anon key; never a service-role or signing key.
