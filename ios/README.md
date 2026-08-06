# Prayer Team — iOS app

SwiftUI app for the prayer team: sign in, read the feed, pray, respond.
Talks to the same Next.js API as the web app, authenticated with a Supabase
Bearer token (supabase-swift handles sign-in and token refresh; the server
applies identical row-level security either way).

## First run

1. Install Xcode from the Mac App Store (Command Line Tools alone can't build
   iOS apps), open it once so it installs the iOS platform, then point the
   CLI at it:

   ```
   sudo xcode-select -s /Applications/Xcode.app
   ```

2. Generate the project (already done if `PrayerTeam.xcodeproj` exists;
   regenerate any time `project.yml` or the file list changes):

   ```
   brew install xcodegen   # once
   cd ios && xcodegen
   ```

3. `open ios/PrayerTeam.xcodeproj`, select your team under
   Signing & Capabilities, pick an iPhone simulator, and Run.

Debug builds call `http://localhost:3005` (run `npm run dev` in the repo
root); Release builds call the production domain. Sign in with your normal
prayer-team account.

CLI builds must keep code signing on ("Sign to Run Locally" needs no team):

```
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   xcodebuild -project PrayerTeam.xcodeproj -scheme PrayerTeam   -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Do NOT pass `CODE_SIGNING_ALLOWED=NO`: an unsigned simulator binary cannot
use the Keychain, so supabase-swift silently fails to persist the session
and every API call throws `sessionMissing` right after a successful
sign-in.

## Layout

```
project.yml              XcodeGen manifest (source of truth; .xcodeproj is generated)
PrayerTeam/
  PrayerTeamApp.swift    @main; routes login ↔ feed on auth state
  Config.swift           Supabase URL/anon key, API base per configuration
  Auth/AuthStore.swift   supabase-swift session, sign in/out, access token
  Networking/APIClient.swift  Bearer-authenticated calls to the Next.js API
  Models/Models.swift    Codable mirrors of the API shapes
  DesignSystem/Theme.swift    sage/mist/ink palette, cards, pills, rise animation
  Features/              Login, Feed (+ store, card), Settings
```

Still to come (plan phases 8–10): triage + respond + notification prefs,
push notifications, TestFlight distribution, bundled Fraunces display font.
