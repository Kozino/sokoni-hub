# Publish Sokoni Hub (consumer) on the iOS App Store

This is the production path for the **buyer app** (`mobile/`), using **Expo EAS** and the existing **GitHub Action** (`Consumer mobile build`). You do not need a Mac to build. You do need an Apple Developer Program membership (you have this) and an Expo account.

Bundle ID (do not change after the first store build): **`qa.sokonihub.consumer`**

---

## What was missing (now fixed in the repo)

| Item | Before | Now |
|---|---|---|
| Store distribution | Production profile did not say `store` | `distribution: "store"` |
| iOS resource class | unset | `m-medium` (EAS iOS cloud) |
| `buildNumber` | unset | `"1"` (EAS remote auto-increment after that) |
| Location permission (iOS) | only in the plugin | also in `infoPlist` (App Store rejection if missing) |
| Push notifications plugin | `expo-notifications` used in code, not in plugins | plugin + `remote-notification` background mode |
| Privacy manifest | unset | UserDefaults / timestamps declared |
| App Store encryption answer | only in infoPlist | also `ios.config.usesNonExemptEncryption: false` |
| iOS deployment target | unset | 15.1 |
| App icon | PNG with alpha channel (Apple often rejects) | flattened 1024×1024 RGB |
| GitHub workflow | `eas init --force` every run (can create a new Expo project) | requires a committed `projectId`; optional **auto_submit** |
| EAS Submit | Android only | iOS submit profile started (`companyName: Sokoni Hub`) |

You still must fill **two values only you have**: Expo **project ID** and Apple **Team / App Store Connect App ID**. Do not invent them.

---

## One-time setup (do this in order)

### 1. Apple Developer — App ID

1. Open [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers**.
2. **+** → **App IDs** → **App**.
3. Description: `Sokoni Hub`.
4. Bundle ID: **Explicit** `qa.sokonihub.consumer`.
5. Capabilities: enable **Push Notifications**. (EAS can add this later; enabling now avoids a failed first build.)
6. Register.

### 2. App Store Connect — create the app record

1. Open [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
2. Platform: iOS.
3. Name: `Sokoni Hub` (must be unique in the store).
4. Primary language: English (U.K. or U.S. is fine).
5. Bundle ID: `qa.sokonihub.consumer`.
6. SKU: `sokonihub-consumer` (internal; buyers never see it).
7. User Access: Full Access.

Copy two numbers and keep them:

- **Team ID**: [developer.apple.com/account](https://developer.apple.com/account) → Membership details (10 characters, e.g. `A1B2C3D4E5`).
- **Apple ID** of the app (numeric, under App Store Connect → the app → **App Information**. This is **not** your email).

### 3. Expo account + token (for GitHub)

1. Create / log in at [expo.dev](https://expo.dev).
2. [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens) → create a token (Account token is enough).
3. GitHub repo **Kozino/sokoni-hub** → **Settings → Secrets and variables → Actions**.
4. New secret name: **`EXPO_TOKEN`**, value: that token.
5. Never put this token in `app.json`, `eas.json`, or the app.

### 4. Link EAS (once) — no computer terminal needed

You do **not** need bash. Pick **A** (simplest) or **B**.

#### A. Expo website + GitHub file edit (recommended)

1. Open [expo.dev](https://expo.dev) and sign in (same account as `EXPO_TOKEN`).
2. **Create a project** (or open it if `sokoni-hub` already exists).
   - Name: `Sokoni Hub`
   - Slug: `sokoni-hub`
3. Open the project → **Project settings** (gear) → copy **Project ID**. It looks like  
   `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`.
4. On GitHub, open [`mobile/app.json`](../../mobile/app.json) → the pencil **Edit**.
5. Find this block at the bottom:

```json
    "extra": {
      "eas": {}
    }
```

6. Change it to (paste **your** ID, do not invent one):

```json
    "extra": {
      "eas": {
        "projectId": "PASTE-YOUR-EXPO-PROJECT-ID"
      }
    }
```

7. Commit to `main`.

#### B. One GitHub Action click

If `EXPO_TOKEN` is already a GitHub secret:

1. GitHub → **Actions** → **Link EAS project (once)** → **Run workflow** (branch `main`).
2. Wait until it is green. It creates the Expo project if needed and **commits** `projectId` into `mobile/app.json` for you.
3. Confirm `mobile/app.json` now contains `"projectId": "…"` with a UUID.

After A or B, GitHub **Consumer mobile build** will accept iOS production. Without this UUID it stops on purpose.

### 5. Give Expo permission to sign iOS (once) — also in the browser

No terminal. Expo website:

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → **+**.
   Access: **App Manager**. Download the `.p8` (once). Copy **Key ID** and **Issuer ID**.
2. [expo.dev](https://expo.dev) → project **sokoni-hub** → **Credentials** → **iOS**.
3. Add the App Store Connect API key (upload the `.p8`, paste Key ID + Issuer ID).
4. Let Expo generate the **Distribution certificate** and **provisioning profile** for `qa.sokonihub.consumer` if it offers to.

Then on GitHub edit [`mobile/eas.json`](../../mobile/eas.json) → `submit.production.ios` to:

```json
"ios": {
  "companyName": "Sokoni Hub",
  "appleTeamId": "YOUR_TEAM_ID",
  "ascAppId": "YOUR_NUMERIC_APP_ID"
}
```

Commit. Do **not** upload the `.p8` or any Apple password into GitHub files.

### 6. Push notification key (so order alerts work on iPhone)

In the same `eas credentials` iOS flow, add an **Apple Push Notifications Key** (p8), or let EAS create one. Without it the store build still ships, but Expo push tokens fail on device.

---

## Build and upload (GitHub)

1. Push the config + `projectId` to `main`.
2. GitHub → **Actions** → **Consumer mobile build** → **Run workflow**.
3. Choose:
   - **platform:** `ios`
   - **profile:** `production`
   - **auto_submit:** `false` the first time (see the build on expo.dev first).
4. Open the Action log. It prints an `https://expo.dev/accounts/…/builds/…` URL.
5. Wait until EAS status is **finished** (about 15–25 minutes). Download the `.ipa` if you want a copy; you do not need it on a Mac.

First production iOS build from GitHub will fail if step 4 (`eas init` + committed projectId) or step 5 (Apple credentials on Expo) is skipped.

### Upload to TestFlight

When the production iOS build is green:

**Option A — GitHub (after `appleTeamId` and `ascAppId` are in `eas.json`)**  
Run the same workflow again with **auto_submit: true**.  
Or from a computer:

```bash
cd mobile
npx eas-cli@latest submit --platform ios --profile production --latest --non-interactive
```

**Option B — Expo website**  
expo.dev → the finished iOS build → **Submit** → App Store Connect.

Apple then processes the build (10–60 minutes). It appears under **TestFlight**.

---

## App Store Connect listing (required before “Submit for Review”)

Fill these or Apple rejects the submission:

| Field | Use |
|---|---|
| Privacy Policy URL | `https://sokonihub.qa/privacy` |
| Support URL | `https://sokonihub.qa` |
| Category | Shopping (secondary: Food & Drink is reasonable) |
| Age rating | Complete the questionnaire (marketplace + user-generated listings; no alcohol/tobacco unless you sell them) |
| Screenshots | iPhone 6.7" **and** 6.1" (or Apple’s current required sizes). iPad if `supportsTablet` stays true — **you must supply iPad screenshots** or set `"supportsTablet": false` and rebuild |
| Description | African grocery marketplace in Qatar; cash on delivery; English / Swahili / Luganda / Twi / Arabic |
| Keywords | qatar, grocery, african food, doha, marketplace |
| Copyright | your legal name / company, year |
| Review notes | Test account: a verified Qatar mobile buyer. Say cash on delivery, location is only for the delivery pin, microphone is only for Ask Sokoni hold-to-talk. Account deletion is in Profile. |

### App Privacy (nutrition label)

Declare at least:

- **Contact Info** (name, email, phone) — for account / orders  
- **Location** (coarse/precise, app function) — delivery pin  
- **Audio** — Ask Sokoni, not linked to identity for ads  
- **Notifications** — order updates  
- **User Content** — not really for buyers; skip if they only buy  

Not used for tracking. Do **not** enable App Tracking Transparency; the app has no IDFA.

### Encryption

You already set `ITSAppUsesNonExemptEncryption` to false (HTTPS only). In App Store Connect answer **No** to custom encryption.

### Sign in with Apple

**Not required.** The app uses phone + email + password, not Google/Facebook/etc.

### Account deletion

Apple requires in-app account deletion if users can register. Sokoni already has this in Profile. Mention it in review notes.

---

## TestFlight, then production

1. Add yourself as an Internal Tester → install from TestFlight.
2. Check: register with a **Qatar** Ooredoo/Vodafone number, login, browse, cart, checkout pin on the map, Ask Sokoni mic permission, push (send a test order update).
3. When happy: App Store Connect → the version → **Add for Review** → **Submit**.

Review is typically 24–48 hours. Rejections are often screenshots, privacy URL, missing iPad shots, or a login tester they cannot use.

---

## If a GitHub iOS production build fails

| Log / error | Fix |
|---|---|
| `EXPO_TOKEN` empty | GitHub secret `EXPO_TOKEN` |
| missing `projectId` | `eas init` locally, commit `app.json` |
| Authentication with Apple failed | App Store Connect API key on Expo credentials |
| Bundle identifier not available | ID `qa.sokonihub.consumer` already used by another team — keep this ID if it is yours |
| Provisioning profile | Re-run `eas credentials -p ios` for production |
| Icon alpha / transparency | Already flattened in this update |
| Missing NSLocationWhenInUseUsageDescription | Already added |
| Push entitlement | Enable Push on the App ID; re-run credentials |

Simulator profile (`ios` + `simulator`) is **not** for the store. Only **production**.

---

## After the first live version

- Each store release: bump `expo.version` in `app.json` (e.g. `1.0.1`). EAS `autoIncrement` bumps iOS **buildNumber** for you.
- Custom domains later: set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` in `eas.json` production `env`, then a new production build.
- Universal Links (`sokonihub.qa`) are not required for v1.
