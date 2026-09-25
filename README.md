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
