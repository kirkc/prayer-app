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
- Feedback email: castro.kirk@gmail.com
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

Everything else: not collected. No third-party analytics or ads SDKs in
the app. (Requester phone numbers never reach the app — the server only
exposes whether a number exists.)

## Version cadence

TestFlight builds expire after 90 days — re-upload before then. The
long-term plan is **unlisted App Store distribution** (Apple's channel
for limited-audience apps: a real App Store listing reachable only by
link), which removes the expiry treadmill. Apply via App Store Connect →
App Distribution once the app has been stable on TestFlight for a while.
