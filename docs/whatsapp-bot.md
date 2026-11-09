# Bottle Up WhatsApp Bot — V1

V1 supports first-time registration, existing-user recognition, pickup scheduling, points, rewards display, pickup history, help, and WhatsApp location messages.

The bot uses the same Supabase profiles, pickup_requests, reward_catalog, and points data as the website. It does not create a second Bottle Up user database.

## Environment variables

Set these as Supabase Edge Function secrets:

- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_VERIFY_TOKEN
- WHATSAPP_APP_SECRET
- SUPABASE_SERVICE_ROLE_KEY

SUPABASE_URL is provided to Supabase Edge Functions.

## Webhook

Set the Meta webhook callback to:

https://<your-supabase-project-ref>.supabase.co/functions/v1/whatsapp-bot

Use the same value configured as WHATSAPP_VERIFY_TOKEN when Meta verifies the webhook.

## First-time registration

The bot collects the user's WhatsApp phone number, name, and WhatsApp location. The phone number is normalized to Nigerian E.164 format (+234...) and linked to the existing profiles.phone field.

A new Supabase Auth user is created server-side. The existing auth-user trigger creates the Bottle Up profile, after which the bot stores the supplied name and city/location label.

## Pickup flow

The bot asks for estimated weight and pickup address/landmark or WhatsApp location. It creates a normal pickup_requests row with status AVAILABLE. The existing collector workflow can then process the request.

WhatsApp input never determines earned points. The existing collection and verification process remains the authority for actual weight and points.

## Rewards

V1 displays the existing reward catalog. Redemption is intentionally not wired into the WhatsApp bot yet because the existing reward RPC is tied to an authenticated Bottle Up session.

The next step is a dedicated server-side WhatsApp redemption RPC that accepts the WhatsApp-linked user ID and applies the same idempotency and points-locking rules as the website redemption flow.

## Proactive notifications

After V1 is live, add collector assigned, pickup accepted, collector on the way, pickup collected, pickup verified, points credited, and reward fulfilled notifications. For conversations outside the customer-service window, use approved WhatsApp message templates.
