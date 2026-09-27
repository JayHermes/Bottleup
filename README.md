# BottleUp

The application lives in **`bottle-up-mvp/`**. Its main entry point is `bottle-up-mvp/src/main.jsx`.

## Run locally

```sh
cd bottle-up-mvp
npm ci
npm run dev
```

Open the local URL printed by Vite. If port 5173 is already occupied, Vite selects another port.

## Build

```sh
npm --prefix bottle-up-mvp run build
```

Vercel and GitHub Actions already build this application directory.

## Design implementation

- `bottle-up-mvp/src/components/Landing.jsx`: redesigned landing page.
- `bottle-up-mvp/src/components/AuthPages.jsx`: sign-in, signup, password recovery and reset screens.
- `bottle-up-mvp/src/components/Brand.jsx`: BottleUp logo.
- `bottle-up-mvp/src/components/Icons.jsx`: local SVG icon components.
- `bottle-up-mvp/public/`: illustrations, font, favicon and the icon library copied from KingFTP.
- `design/brand-study-01/`: original artwork, prompts and design notes.

The landing and authentication forms can be viewed without backend configuration. Actual account operations require the Supabase environment variables documented in `bottle-up-mvp/.env.example`. No preview sessions bypass authentication.

### Dashboard refresh and bank details

Run the nested app's development server and open `/dashboard-preview` to review the new dashboard using clearly labelled sample data. This preview is development-only and cannot save pickups, redeem rewards, or save bank details. Production uses the existing authenticated dashboard.

When the Supabase credentials arrive, set the frontend URL and publishable/anon key as described above, then run `bottle-up-mvp/supabase/dashboard-settings.sql` after the main schema. It creates the bank-details table with account-owner RLS policies. Test with two separate user accounts: one user's details must not be readable or editable by the other. Bank account numbers remain text so leading zeroes are preserved. Details are manually supplied, not bank-verified; cash payouts are not implemented.

The refresh includes verified-weight impact totals independent of point redemptions, pickup filters/search, reward confirmation, account help, and bank-details create/edit/remove flows. Live persistence must be verified against the actual Supabase project once credentials are supplied.

The isolated PostgreSQL test is `bottle-up-mvp/tests/bank-accounts.test.mjs`. Run it with `node --test` where `@electric-sql/pglite` is installed, or set `PGLITE_MODULE` to that package's absolute module path. It checks owner access, cross-user isolation, anonymous denial, valid updates/removal, and 10-digit validation.
