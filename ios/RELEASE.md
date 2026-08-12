# Releasing Prayer Team to TestFlight

## Prerequisites (one-time, ~5 minutes total)

**Register a device.** Apple refuses to create provisioning profiles for a
team with zero registered devices, which blocks `xcodebuild archive`. Plug
your iPhone into the Mac once, open Xcode → Window → Devices and
Simulators, and let it register ("Trust this computer" on the phone). This
also lets you run the app on your own phone: select it as the run
destination and hit Run (first launch needs Settings → General → VPN &
Device Management → trust your developer certificate).

**Create the app record** — next section.

## One-time App Store Connect setup (browser, ~3 minutes)

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** →
   **+** → **New App**:
   - Platform: iOS
   - Name: `Prayer Team — Redemption` (app names are globally unique on the
     store; adjust if taken — this is only what testers see)
   - Primary language: English (U.S.)
   - Bundle ID: `org.redemptionseattle.prayerteam` (in the dropdown — it was
     registered when push was set up)
   - SKU: `prayerteam` (internal only)
   - Full access.

## Build & upload (repeatable, from `ios/`)

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodegen
xcodebuild -project PrayerTeam.xcodeproj -scheme PrayerTeam \
  -destination 'generic/platform=iOS' -archivePath build/PrayerTeam.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/PrayerTeam.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
```

`ExportOptions.plist` (in this directory) uploads straight to App Store
Connect. First run may pause to mint the Apple Distribution certificate —
that's the `-allowProvisioningUpdates` flag doing its job with the Xcode
account session. Bump `CURRENT_PROJECT_VERSION` in `project.yml` for each
new upload.

The build appears under **TestFlight** in App Store Connect after ~10-30
minutes of processing.

## Distributing to the team

TestFlight → **External Testing** → create a group ("Prayer Team") →
**Public link** on. Send the link; teammates install the TestFlight app,
tap the link, and sign in with their normal prayer-team account.
External builds need Beta App Review the first time — usually a day.

- Beta App Description: see below.
- Feedback email: interprayapp@gmail.com
- **Sign-in required — demo account.** A member of the isolated `test-church`
  org holding only fictional sample requests. Verified against production:
  signs in, sees Test Church only (never Redemption), and `sms_enabled` is
  false so the reply-by-text feature is hidden — a reviewer cannot send a
  message to a real person.
  - Email: `applereview@prayerteam.example`
  - Password: `Grace-qkglxnh8uc`

### App Review notes (paste alongside the credentials)

> This app is the private companion for a church's prayer team. Accounts are
> created only by a church administrator — there is no public sign-up, so the
> demo account below is required.
>
> The demo account belongs to an isolated demonstration congregation ("Test
> Church") containing only fictional sample prayer requests. No real
> congregant data is visible to it. Every church's data is separated at the
> database level.
>
> After signing in you can: browse the prayer request feed, tap Pray to record
> a prayer, swipe a card to Archive or mark Spam, switch between the Active /
> Archived / Spam tabs, open a request for detail, and adjust notification
> preferences via the person icon (top right). Reply-by-text is intentionally
> unavailable to this demonstration congregation because it has no phone
> number configured, so no messages can be sent during review.

Keep the demo feed stocked: if `test-church` ever empties out, re-seed a few
fictional requests (and one archived) so reviewers see a working app.

### Beta App Description (paste)

> Prayer Team is the private companion app for a church's prayer team.
> Members sign in (accounts are created by their church admin — there is
> no public signup), read prayer requests the congregation has shared,
> mark that they've prayed, and optionally reply by text where the church
> has that enabled. Push notifications announce new requests. The demo
> account is a member of a demonstration congregation with sample data.

## App Privacy questionnaire (App Store Connect → App Privacy)

Data collected, all **linked to identity**, none used for tracking:

| Type | Purpose | Notes |
|---|---|---|
| Email address | App functionality | Sign-in identity |
| Name | App functionality | Display name in the roster |
| Other user content | App functionality | Prayer requests + replies the team works with |
| Device ID | App functionality | APNs push token, registered by `POST /api/devices` |

Everything else: not collected. No third-party analytics or ads SDKs in
the app. (Requester phone numbers never reach the app — the server only
exposes whether a number exists. Vercel Analytics runs on the website
only, never in the app, so it isn't declared here.)

---

# Releasing to the App Store (unlisted)

TestFlight builds expire after 90 days. **Unlisted App Distribution** is
Apple's channel for limited-audience apps — a real App Store listing
reachable only by a direct link, never by search — which is the right
shape for an invite-only prayer team and ends the re-upload treadmill.

The app still goes through full App Review. Apple declines the unlisted
request if the app hasn't been submitted for review yet, or if it's
sitting in beta, so the order below matters.

## 1. Listing fields (App Store Connect)

| Field | Value |
|---|---|
| Support URL | `https://prayer.redemptionseattle.org/support` |
| Privacy Policy URL | `https://prayer.redemptionseattle.org/legal/privacy` |
| App Review contact email | `interprayapp@gmail.com` |
| Category | Lifestyle |
| Price | Free |

Both URLs only resolve after the web app is deployed — deploy before
submitting, or review fails on a dead link.

## 2. Screenshots

Five 6.9" images live in `ios/screenshots/` (1320×2868, opaque — App
Store Connect rejects any alpha channel). 6.9" is the only required size;
supplying it means 6.5" isn't needed.

To regenerate, sign in to the simulator as the demo account so no real
congregant data is ever in a store asset:

```bash
xcrun simctl boot 'iPhone 17 Pro Max'
cd ios/screenshots && xcrun simctl io booted screenshot --type=png 01-feed.png
swift flatten.swift *.png   # strips the alpha simctl always writes
```

## 3. Age rating

Answer the user-generated-content question **yes** — prayer requests are
written by congregants. Expect the questionnaire to land at 13+ rather
than 4+. Don't try to talk it down; a rating that doesn't match the
content is its own rejection.

## 4. Review notes

Paste the App Review notes above, then add these three paragraphs.

> **Unlisted distribution.** This app is intended for unlisted
> distribution. It serves the prayer team of a specific church, not the
> general public, and a request for unlisted distribution has been
> submitted separately.

> **Guideline 1.2 (user-generated content).** Prayer requests are written
> by members of a congregation and flow in one direction — from an
> anonymous requester, through a church's public request form, to that
> church's closed prayer team. App users cannot post content to one
> another, cannot see one another's submissions, and cannot be contacted
> by other users. Team accounts are created only by a church
> administrator, so every person who can see a request has been vetted by
> that church. The team can archive, mark as spam, or delete any request
> from inside the app, and objectionable content can be reported to
> interprayapp@gmail.com, published on our support page, which we answer
> within one business day.

> **Guideline 5.1.1(v) (account deletion).** The app offers no account
> creation — accounts exist only when a church administrator creates one.
> Even so, Settings → Delete my account permanently deletes the signed-in
> member's account and personal data immediately, with no support contact
> required.

## 5. Submit, then request unlisted

1. Submit the build for App Review with the notes above.
2. File the unlisted request at
   [developer.apple.com/contact/request/unlisted-app](https://developer.apple.com/contact/request/unlisted-app/).
   The app's Apple ID is **6798854175**.
3. On approval, Pricing and Availability switches to "Unlisted App" on
   its own and Apple generates the shareable link.

## Before any upload

- Bump `CURRENT_PROJECT_VERSION` in `project.yml` — a repeated build
  number is rejected during processing.
- Set the `APNS_*` variables in Vercel (see `.env.example`). Without
  them `apnsConfigured()` returns false and production pushes silently
  no-op; email still goes out, so it looks like push "just doesn't work".
- Keep the demo feed stocked: if `test-church` ever empties out, re-seed
  a few fictional requests (and one archived) so reviewers see a working
  app.
- **Confirm push works on the first TestFlight install.** Install the
  build, then tap **Settings → Send a test notification**. It reports
  each channel separately, so read the line under the button:

  | It says | It means |
  |---|---|
  | `push sent to 1 device` | The production gateway works. Done. |
  | `push failed for 1 of 1` | APNs rejected the token — almost certainly the entitlement (below). |
  | `this device isn't registered yet` | The token never reached the server; check notification permission. |
  | `push isn't set up on the server` | `APNS_*` missing from the Vercel environment. |

  Why this matters: the entitlement pins `aps-environment: development`
  and relies on the export step re-signing it to production, while the
  app reports `"production"` for release builds. Every push that has ever
  worked went over the **sandbox** gateway from a development-signed
  build — the production pairing is untested, and it fails silently
  (a rejected token is deleted as dead with nothing logged). If the test
  reports a failure, split the entitlements per configuration in
  `project.yml`: development for Debug, production for Release.
