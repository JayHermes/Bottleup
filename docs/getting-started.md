# Getting started

## Prerequisites

- Node.js 24 and npm. The receipt-handler tests use Node's TypeScript stripping API.
- A Supabase project for authenticated workflows.
- Git to clone this repository.

The frontend does not require Rust, Anchor, Solana CLI, a wallet, or a paid map API key. Program developers should also read the [Solana guide](../solana-verification/README.md).

## Frontend setup

```sh
git clone https://github.com/JayHermes/Bottleup.git
cd Bottleup/bottle-up-mvp
npm ci
cp .env.example .env
```

Edit `.env` using your project's API settings:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

The app also accepts `VITE_SUPABASE_ANON_KEY` for a legacy public anon key. If both key variables are set, the publishable key takes precedence. Never use a service-role key. Restart Vite after changing environment variables.

```sh
npm run dev
```

Open Vite's printed URL; it may choose another port if 5173 is occupied. The landing and auth screens can render without credentials, but login and database operations cannot work until the backend is configured.

## New Supabase project

For a **new, empty project**, run [`bottle-up-mvp/supabase/schema.sql`](../bottle-up-mvp/supabase/schema.sql) in the Supabase SQL editor. This bootstrap includes the application tables, pickup lifecycle, points ledger, bank-detail ownership policies, and private photo storage. Do not separately replay its included points migration.

If enabling Solana receipts, additionally apply [`202610120001_add_solana_receipt_fields.sql`](../solana-verification/migrations/202610120001_add_solana_receipt_fields.sql), then configure the program and Edge Function as described in [deployment](deployment.md). The bootstrap alone does not deploy the receipt function or on-chain program.

Configure Supabase Auth's site URL and permitted redirect URLs for your local and hosted origins. Password recovery returns through the application, so test the complete email-link flow for each environment.

Sign up normally to create a user profile. Collector approval is an administrator workflow; the first administrator must be provisioned by a trusted project owner through backend administration. Do not expose role promotion in signup metadata or a public UI.

## Existing BottleUP project

The existing project already has its points and receipt migrations. **Do not run `schema.sql` against it**: it is a bootstrap, not an incremental upgrade. Review deployed migration history and use an additive migration for a change to existing data.

Supplementary SQL files are historical or targeted updates, not a directory of scripts to run blindly. In particular, photo and dashboard setup are already incorporated into the fresh-project bootstrap.

## Preview and validation

```sh
npm test
npm run build
npm run preview
```

`/dashboard-preview` is available only in development and uses labelled sample data. It deliberately disables persistence. Tests use isolated fixtures; a successful local test does not configure or migrate your live project.
