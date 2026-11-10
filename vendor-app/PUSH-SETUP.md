# Push notifications — browser-only setup (no terminal)

Everything here happens in three websites: **github.com**, **expo.dev** and
**console.firebase.google.com**. No commands, no local SDK.

The app's code is already written (`src/usePushToken.ts`, the loud Android
channel, `POST /push/token`, and the sender in `api/src/push.ts`). What is
missing is the credentials.

| # | Task | Where |
| --- | --- | --- |
| 1 | Copy your **Project ID** | expo.dev ✅ |
| 2 | Paste it into `app.json` | github.com ✅ `0131c3ed-…` |
| 3 | Create the Firebase app + `google-services.json` | firebase console → github.com |
| 4 | Upload the **FCM v1 service account key** | firebase console → expo.dev |
| 5 | Upload the **APNs key** (iOS) | expo.dev |
| 6 | Start a build | expo.dev |
| 7 | Test | your phone |

---

## 1. Copy your Project ID

1. Go to **https://expo.dev** and sign in.
2. Open your account → **Projects** → **Sokoni Vendor** (slug `sokoni-vendor`).
3. Left sidebar → **Project settings**.
4. Copy **Project ID** — a UUID like `6f2c1a44-9b3e-4d21-8a77-0c5e9d1b2f30`.

If **Projects** is empty, the EAS project never got created under this account —
tell me and I will give you the "create project from GitHub" path instead.

## 2. Paste it into `app.json` — ✅ done

Already in the repo. `vendor-app/app.json` now ends with:

```json
  "extra": {
    "eas": {
      "projectId": "0131c3ed-cc38-438f-bed2-d428a78a5e97"
    }
  }
```

Verified with `expo config`: slug `sokoni-vendor`, projectId resolves to that
UUID, so `getExpoPushTokenAsync()` will no longer return
"Alerts are not set up in this app build yet."

> This UUID belongs to the **Sokoni Vendor** project only. Your buyer app
> (`sokoni-hub`) and driver app (`sokoni-driver`) are separate EAS projects with
> their own project ids — do not copy this one into them.

> Note: a build made by EAS also exposes `Constants.easConfig.projectId`, so a
> store build may already work without this. Filling it in makes **every** build
> work, including previews.

## 3. Firebase — the Android client file — ✅ done

`vendor-app/google-services.json` is in the repo (commit `25cc81b`) and is now
referenced from `app.json`:

```json
"googleServicesFile": "./google-services.json",
```

What the file says, and why it matters:

| Field | Value |
| --- | --- |
| `project_id` | **`niqa-21e87`** ← the Firebase project everything else must come from |
| `project_number` | `616371732328` |
| package_name | `qa.sokonihub.vendor` ✅ matches `app.json` |
| api_key | present ✅ |

Verified with `expo prebuild`: the file is copied to `android/app/` and the
`com.google.gms.google-services` Gradle plugin is applied automatically.

## 4. Firebase — the FCM v1 server key  ← *the step you are on*

**Get the key from Firebase**

1. Open **https://console.firebase.google.com** and pick the project whose id is
   **`niqa-21e87`** — the same one your `google-services.json` came from. Check
   **Project settings → General** if the display name is unclear; the project id
   is printed there.
2. **Project settings** (the gear at the top left) → **Service accounts** tab.
3. Click **Generate new private key** → the warning dialog appears → **Generate key**.
4. A file downloads, named something like
   `niqa-21e87-firebase-adminsdk-abc12-3f9d8c7b21.json`.

> This file contains a `private_key`. Treat it like a password: never commit it,
> never upload it to GitHub, never paste it into a chat. If it leaks, delete it
> in Firebase and generate a new one.

**Upload it to Expo**

5. Open **https://expo.dev** and sign in with the account that owns the
   `sokoni-vendor` project.
6. Go to `https://expo.dev/accounts/<your-username>/projects/sokoni-vendor/credentials`
   — or from the project page: left sidebar → **Credentials** (older dashboard:
   Project settings → Credentials).
7. Stay on the **Android** tab. You should see a card for the application id
   **`qa.sokonihub.vendor`**. If it is missing, add the application id first.
8. Find the row **FCM V1 service account key** → **Add a service account key**
   (some screens label it *Upload*) → choose the JSON from step 4 → save.
9. The row now shows the key with an upload date — that is your confirmation.

**Two checks that save an afternoon**

- In **Google Cloud console → APIs & Services → Enabled APIs**, *Firebase Cloud
  Messaging API* must be enabled. It is by default for projects created after
  mid-2024; if `niqa-21e87` is older, enable it.
- The service account must come from the **same** project as
  `google-services.json` (`niqa-21e87`). A key from another project produces
  tokens that Key cannot send to — the notification silently never arrives and
  the receipt says `MismatchSenderId`.

Uploading this key affects **sending only** — you do not need a rebuild for it.
The rebuild is needed for the *device* side (`google-services.json`), which is
step 3 and already in place.

## 5. iOS — APNs key

1. expo.dev → your project → **Credentials** → **iOS** →
   `qa.sokonihub.vendor` → **Push Notifications**.
2. Upload an APNs `.p8` key from developer.apple.com, or let Expo generate one
   from your Apple account.

Skip this until you plan an iOS release. It has no effect on the Play build.

## 6. Start a build from the browser

One-time connection: **Project settings → GitHub → Connect repository** →
`Kozino/sokoni-hub`. When it asks for the source directory, use **`vendor-app`** —
your app is not at the repo root, and this is the single most common reason a
GitHub build fails with "package.json not found".

Then, for each build: project → **Builds** → **Build from GitHub** → pick:

| Field | Value |
| --- | --- |
| Git ref | `main` |
| Platform | Android |
| Profile | **`preview`** to test push (installs as APK) · **`production`** for Play |
| Base directory | `vendor-app` |

Prerequisite: the Expo GitHub app needs one successful build of that platform
already made from a computer — you have that, which is how the current AAB
exists.

## 7. Test it

**The realistic test needs no tooling at all:** install the **preview** build on a
vendor phone, sign in, allow notifications, then place a real order for that
vendor from the buyer app or the website. Your API fires
`notifyVendorOfOrder()` and the loud alert should fire on the phone.

To check the token alone, open **https://expo.dev/notifications**, paste the
token (`ExponentPushToken[…]`, logged by the app on sign-in and stored in
`push_tokens`) and send yourself a title and body.

If nothing arrives, tell me and I will walk the receipt check — the usual cause
is step 4 (key missing) or a `google-services.json` from a different Firebase
project than the key.

## 8. Version codes — nothing for you to run

Earlier I said to run `eas build:version:set`. You do not need it.
`eas.json` now has `appVersionSource: "remote"` + `autoIncrement: true`, and
`app.json` carries `versionCode: 2` as the floor, so your next production build
lands on **2 or higher** on its own. The number it used is shown on the build
page in the dashboard, next to the version name.

Each production build after that increments again. If a build ever comes out at
`1`, the remote counter was not picked up — say so and I will switch the project
to local versioning instead.

---

## What was changed in the repo for this

| File | Change |
| --- | --- |
| `vendor-app/app.json` | `extra.eas.projectId` = `0131c3ed-cc38-438f-bed2-d428a78a5e97`, plus `android.googleServicesFile` |
| `vendor-app/eas.json` | `android.image: "latest"` on `preview` and `production` — required for GitHub-triggered builds |
| `api/src/push.ts` | vendor pushes now target channel `vendor-alerts-loud` (the app's real channel) and carry `sound: order_alert.wav` |

## Still worth doing before release

- **Status-bar icon**: no `icon` is configured for the `expo-notifications`
  plugin, so Android draws a plain white square in the status bar. A 96×96
  white-on-transparent PNG plus `"icon": "./assets/notification-icon.png"` fixes
  it. Ask me and I will generate the asset.
- **Never change a channel's sound in place.** Android freezes a channel's sound
  when it is first created — that is why the vendor channel is named
  `-loud`. If you ever change the wav, ship a *new* channel id.
