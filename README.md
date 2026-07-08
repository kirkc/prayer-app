# Church Prayer App

An SMS-first prayer request tool. A church member texts a prayer request to a
dedicated number (or submits it on the web). The prayer team sees it in a private
dashboard, marks that they **prayed**, and can **respond** with a warm text reply.

## The care loop

1. Someone texts the Twilio number (or fills the web form on `/`).
2. The request is saved and the sender gets a warm auto-acknowledgment.
3. Signed-in team members see it in the dashboard feed.
4. A team member taps **Pray** — recorded once per person, with a visible count.
5. A team member can **Respond**, which sends an SMS back, logs the reply,
   marks the request replied, and counts as a prayer.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Supabase** (Postgres + Auth) — email/password auth for the team
- **Twilio** — inbound and outbound SMS

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Environment** — copy `.env.example` to `.env.local` and fill in your
   Supabase and Twilio credentials.

3. **Database** — run the migrations in `supabase/migrations` against your
   Supabase project (SQL editor or the Supabase CLI), in order:
   - `001_create_prayer_requests.sql`
   - `002_care_loop.sql`

4. **Create a team member** — add a user in the Supabase dashboard
   (Authentication → Users). A matching `profiles` row is created automatically.
   Set `role = 'admin'` on that row if you want to designate an admin.

5. **Twilio webhook** — point your Twilio number's "A message comes in" webhook
   to `https://<your-domain>/api/sms` (POST). Set `TWILIO_WEBHOOK_URL` to that
   same URL so inbound signatures validate correctly behind a proxy.

6. **Run**
   ```bash
   npm run dev
   ```
   - `/` — public prayer request form
   - `/login` — team sign-in
   - `/dashboard` — the prayer feed (auth required)

## Privacy notes

- Raw phone numbers are **never sent to the browser.** The database enforces
  this with column-level grants (see `002_care_loop.sql`); only the server-side
  service role can read `phone`, and only to send replies.
- The public form is rate-limited and has a honeypot. The limiter is in-memory
  (per server instance) — for production scale, swap `lib/rate-limit.ts` for a
  shared store such as Upstash Redis.
- Inbound Twilio webhooks are signature-validated in production.

## Not built yet (intentionally)

Message audit log, admin console, phone hashing/encryption for repeat-sender
matching, crisis/escalation handling, and analytics. See the engineer handoff
doc for the longer-term vision.
