# Publish Sokoni Vendor on the iOS App Store

Production path for the **vendor app** (`vendor-app/`), using **Expo EAS** and GitHub Action **Vendor mobile build**. No Mac is required to compile. You already have an Apple Developer account and the Expo token used for the buyer app.

Bundle ID (do not change after the first store build): **`qa.sokonihub.vendor`**

Expo project is **already linked**: slug `sokoni-vendor`, projectId `0131c3ed-cc38-438f-bed2-d428a78a5e97`. Do not run `eas init --force` again.

Website / legal links: **https://sokonihub.qa**  
API: **https://api.sokonihub.qa**

This is a **separate App Store app** from Sokoni Hub (buyer). Buyers and vendors cannot share one listing.

---

## What was missing (now fixed)

| Item | Before | Now |
|---|---|---|
| Store distribution | Production profile had no `distribution` | `distribution: "store"` |
| iOS resource class | unset | `m-medium` |
| `buildNumber` | unset | `"1"` (EAS remote auto-increment after that) |
| iOS deployment target | unset | **16.4** (SDK 57 rejects 15.1) |
| Encryption answer | unset | `usesNonExemptEncryption: false` |
| Privacy manifest | unset | UserDefaults / timestamps declared |
| `expo-secure-store` plugin | used in code, not in plugins | plugin added |
| App icon | PNG with alpha channel | flattened 1024×1024 **RGB** |
| Web URL | Netlify | `https://sokonihub.qa` |
| GitHub workflow | `eas init --force` every run | requires existing `projectId`; optional **auto_submit** |
| EAS Submit | empty | `companyName: Sokoni Hub` |

Do **not** invent Apple Team ID or App Store Connect App ID. Paste them later if you want auto-submit.

---

## One-time Apple setup

### 1. App ID

1. [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers** → **+** → App.
2. Description: `Sokoni Vendor`.
3. Bundle ID **explicit**: `qa.sokonihub.vendor`.
4. Enable **Push Notifications** → Register.

### 2. App Store Connect app (new listing)

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → New App → iOS.
2. Name: `Sokoni Vendor` (must be unique; not the same as Sokoni Hub).
3. Bundle ID: `qa.sokonihub.vendor`.
4. SKU: `sokonihub-vendor`.
5. Primary language: English.

Keep for later (optional, for auto-submit):

- **Team ID** (Membership, 10 characters)
- Numeric **Apple ID** of this app (App Information — not your email)

### 3. Expo token

Reuse GitHub secret **`EXPO_TOKEN`** (same as the buyer app). No second token.

### 4. First iOS signing (browser Codespace — Expo website cannot Generate a .p12)

The Expo **Credentials** page only **uploads** a `.p12`. Cancel that. GitHub Actions cannot type Apple 2FA.

1. GitHub repo **sokoni-hub** → **Code → Codespaces** → open or create on `main`.
2. Dark terminal:

```bash
cd /workspaces/sokoni-hub/vendor-app
npm ci
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
```

3. Log in to Expo (same account as `EXPO_TOKEN`).
4. **Log in to your Apple account?** → **Yes** → Apple ID, password, iPhone 2FA.
5. **Generate a new Apple Distribution Certificate?** → **Yes** if none exists. If Expo already has the certificate from the buyer app, reuse it.
6. **Generate a new Apple Provisioning Profile?** → **Yes** (this one is new: `qa.sokonihub.vendor`).

If it says `Failed to resolve plugin` / `node_modules`, you skipped `npm ci`.

When Expo prints a build URL, the profile is created. Let the build finish, or cancel after those Yes answers and use GitHub next time.

### 5. Later builds (GitHub)

**Actions → Vendor mobile build → Run workflow**

- platform: **ios**
- profile: **production**
- auto_submit: **false** the first time

---

## Submit to TestFlight

On the finished expo.dev build click **Submit**, or in Codespace:

```bash
cd /workspaces/sokoni-hub/vendor-app
npx eas-cli@latest submit --platform ios --profile production --latest
```

This uploads to TestFlight. It does **not** put the app on the public store.

---

## App Store listing (before Add for Review)

| Field | Use |
|---|---|
| Primary category | **Business** |
| Secondary | Shopping |
| Privacy Policy URL | `https://sokonihub.qa/privacy` |
| Support URL | `https://sokonihub.qa` |
| Copyright | `2026 Sokoni Hub Retail and Business Support Platforms` |
| Sign-in required | **On** — a **vendor** email + password (not the buyer demo) |
| Release | Manually release this version |
| iPhone screenshots | 6.1" `1179×2556` (and 6.3" if asked) |
| iPad | Required while `supportsTablet` is true — 13" `2064×2752` |

**Notes for App Review:** this app is for **vendors/providers** in Qatar, not shoppers. Use the demo vendor login. New self-service vendor signup may go through the website. Push alerts use the microphone-free order sound. No card processing in-app. HTTPS only; answer **No** to custom encryption.

---

## If a build fails

| Log / error | Fix |
|---|---|
| `EXPO_TOKEN` empty | GitHub secret |
| missing `projectId` | already in `vendor-app/app.json` — do not wipe it |
| `deploymentTarget` 15.1 | must stay **16.4** |
| plugin / node_modules | `cd vendor-app && npm ci` |
| Expo Go warning | ignore on a production profile |
| Credentials only Upload .p12 | cancel; use Codespace Apple login |
| Bundle identifier not available | `qa.sokonihub.vendor` already used on another team |
| Icon alpha | already flattened RGB |

Simulator profile is **not** for the store. Only **production**.
