# Auth design continuation

Sign-in, signup, forgotten-password, new-password, email-confirmation, and password-saved states now use the same cream and bottle-green visual system. Privacy and terms use the same frame. The landing page retains its warm palette, with bottle green restored to the logo, primary actions, stamp and one supporting panel.

New artwork: `auth-recycling.png` (original) and `bottle-up-mvp/public/illustrations/auth-recycling.webp` (compressed website asset). Generated using the built-in image tool; the full prompt is in `auth-illustration-prompt.txt`.

Implementation is in `src/components/AuthPages.jsx` and `auth.css`. Existing Supabase sign-in, sign-up, email reset, and password update calls are preserved. Account forms can be viewed without credentials configured; attempts to submit show an honest unavailable-service message and do not make an API request. No demo sessions or account bypasses were added.

Validation: production build; desktop and mobile visual checks for sign-in/signup/recovery; new-password layout checked in a temporary local harness, subsequently removed; password visibility toggle; reset-email unavailable-service handling. Password visibility resets when switching auth modes. Actual email delivery, account creation, and password updates require a configured backend and were not performed. The existing Mapbox chunk-size build advisory remains.
