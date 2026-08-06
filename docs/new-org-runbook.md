# Onboarding a new church

The app is multi-tenant: every church is a row in `organizations`, every
tenant-owned row carries `org_id`, and row-level security guarantees one
church can never see another's requests, roster, or replies
(`scripts/verify-org-isolation.mjs` proves it — run it after any
policy-touching migration).

A new church starts **web-only**: their public form takes typed requests, the
team prays and triages in the dashboard, digests and alerts arrive by email.
Everything SMS (texting a request in, "someone prayed" updates, replies by
text) stays hidden until the org has its own Twilio number — see the last
section, and don't rush it: A2P registration is per-church and slow.

## 1. Create the organization

SQL editor (or `supabase db` shell), as the operator:

```sql
insert into public.organizations (slug, name)
values ('hillside', 'Hillside Community Church');
```

- `slug` — lowercase letters/numbers/hyphens; becomes the public form URL
  (`/hillside`) and the API path. Reserved app paths are rejected by a check
  constraint.
- `name` — how the church is named in email eyebrows, invite copy, and (once
  SMS exists) text signatures.
- Optional columns: `from_email` (their verified Resend sender — leave null to
  use the neutral shared sender), `reply_to`, `allowed_origins` (extra sites
  allowed to embed/post their form cross-origin), `timezone` (recorded, not
  yet used by cron).

## 2. Invite their first admin

Invites are the **only** way members come into existence — the profile
trigger rejects any auth user created without the invite marker, so users
added by hand in the Supabase dashboard will fail. As the super admin,
call the invite API with the org slug (signed in to the app, from the
browser console — or curl with your session cookie):

```js
await fetch('/api/admin/members', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'pastor@hillside.example',
    display_name: 'Pastor Sam',
    org_slug: 'hillside',
    role: 'admin',
  }),
}).then(r => r.json())
```

They get the standard invite email (branded with their church's name),
choose a password, and land in an empty dashboard that is entirely theirs.
From there they invite their own team from `/admin` — no operator involvement.

## 3. Share their links

- Public form: `https://<app-domain>/hillside`
- Team sign-in: `https://<app-domain>/login` (same for every church)
- Their form links to the generic `/legal/privacy` and `/legal/terms` pages.

## One-time platform setup (operator)

- **Disable public signup** in Supabase → Authentication → Sign In / Providers.
  The database trigger already prevents self-signups from becoming members,
  but the toggle stops stray auth accounts entirely.
- **Neutral sending domain**: buy/choose a product domain, verify it in
  Resend, set `NEUTRAL_FROM_EMAIL="Prayer Team <hello@thatdomain>"` in Vercel.
  Until then, orgs without `from_email` fall back to the Redemption sender.
- The invite/reset links use the deployed URL (`lib/site-url.ts`); if the app
  ever moves domains, allow-list the new `/set-password` and `/auth/confirm`
  URLs in Supabase → Authentication → URL Configuration.

## What web-only churches don't get

- No "text us" card or phone opt-in on their form (and posted phone numbers
  are discarded server-side — we never store what we can't act on).
- No SMS replies: the Respond button never appears (`has_phone` is always
  false for their requests) and the API refuses with "SMS isn't set up for
  your church yet."
- The prayer-updates cron skips them entirely.

## Adding SMS to a church later

This is a project, not a toggle — plan weeks, not days:

1. Buy a Twilio number for them (or sub-account, if billing should separate).
2. **A2P 10DLC registration is per-brand**: register the church's own legal
   entity and a campaign for it. Their public form page (with the consent
   language, which appears automatically once `twilio_phone` is set) is the
   campaign's consent/CTA evidence. Redemption's registration does not cover
   other churches.
3. They need real, church-specific privacy/terms pages for the campaign —
   the generic `/legal/*` pages are not tied to a registered brand.
4. Point the number's inbound webhook at `https://<app-domain>/api/sms` —
   the handler routes by the `To` number automatically.
5. `update organizations set twilio_phone = '+1...' where slug = 'hillside';`
   Everything else lights up on its own: form SMS elements, ack texts, prayer
   updates, replies — all signed with and sent from their number.

## Removing a test church

```sql
-- order matters only for clarity; FKs cascade from the org
delete from auth.users where id in
  (select id from public.profiles where org_id = (select id from public.organizations where slug = 'hillside'));
delete from public.prayer_requests where org_id = (select id from public.organizations where slug = 'hillside');
delete from public.message_log where org_id = (select id from public.organizations where slug = 'hillside');
delete from public.organizations where slug = 'hillside';
```

## Neutral Sending Domain
Neutral sending domain: interpray.app is purchased and parked for this (Aug 2026). Deliberately NOT verified in Resend yet — the free plan allows one domain and Redemption's is using it; until a real second church onboards, orgs without from_email fall back to the Redemption sender and nothing breaks. When church #2 is real, either upgrade Resend (~$20/mo, which also raises send limits) or swap the verified domain to interpray.app and send every church's mail from it — then set NEUTRAL_FROM_EMAIL="Prayer Team <hello@interpray.app>" in Vercel. The domain is also the natural product home later (church onboarding UI, landing page) if this grows beyond two congregations.