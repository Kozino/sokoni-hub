# Google Play release checklist — EAS Build

This driver project is configured for **Android API 36**, release R8/ProGuard minification, and EAS mapping-file artifacts.

## 1. Keep the SDK 51 compatibility patch

`expo-modules-core@1.12.26` needs a one-line null-safety fix when compiled against newer Android SDKs. The included `patches` directory and `postinstall` script apply it automatically after `npm ci` or EAS's dependency installation. Do not edit `node_modules` directly or remove the patch.

The ProGuard rules also retain Expo's reflectively loaded `RNHeadlessAppLoader`, which is needed for background tasks while the app is closed.

## 2. Run a new production build

From the `driver` directory:

```bash
eas build --platform android --profile production
```

The production profile in `eas.json` builds an AAB and saves this additional artifact:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

EAS signs the AAB with the upload credentials configured for your project. This project uses remote app-version management, so confirm that the resulting build's versionCode is higher than the version already in Play Console.

## 3. Download the AAB and mapping file

On the completed build's page on Expo:

1. Download the Android **AAB** normally.
2. Choose **Download artifacts** to download the additional build-artifacts archive.
3. Extract that archive and find:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

The mapping file is created by R8 during a successful release build. It is not a JavaScript source map and is not included in the source ZIP.

## 4. Upload both to Play Console

Upload the AAB, then upload `mapping.txt` as the release's **ReTrace/deobfuscation file** in Play Console.

**Important:** the AAB and mapping file must come from the exact same EAS build. Never reuse a mapping file from another build or version.

## 5. Test release behaviour

Install the signed release build on a real device before rollout. Check:

- Home and Settings test alerts play `delivery_alert.wav`.
- Background/closed-app delivery alerts still work after deploying `api/src/push.ts`.
- Location, proof of delivery, COD, completion, and offline retry still work.

The release configuration includes `res/raw/keep.xml` so resource shrinking retains the custom sound.

## Optional local Android build

If using `eas build --local` or Android Studio, the same mapping path is available directly under `driver/android/app/build/outputs/mapping/release/mapping.txt` after a successful release build.

## 6. Startup fix in 1.0.2 — "Preparing your driver portal…" never finishing

That line is the app's own session-restore step (`App.tsx` ← `AuthContext`), not the native splash. In 1.0.1 it waited on two things that were allowed to fail silently or hang: reading the saved session from the Android keystore, and the `/auth/me` check. If either one threw or never answered, `loading` stayed `true` and the screen never moved.

What changed in 1.0.2:

- The saved session is read behind a 5-second cap, and an unreadable entry is deleted and treated as "signed out" instead of blocking the app. Android keystore entries become unreadable after some device restores and key resets.
- Every API call now has a deadline (25 s, or 120 s for photo uploads), so `/auth/me` can never hold the loading screen open.
- A network failure keeps the saved session and shows a **Cannot reach Sokoni** screen with **Try again** and **Sign in again**. It no longer signs the driver out for a bad connection.
- Android auto-backup is disabled (`android:allowBackup="false"`), so a Play Store reinstall cannot restore a secure-store blob encrypted with a key that no longer exists on the device.
- A 30-second last-resort guard clears the loading state even if a future change misbehaves.

**If a 1.0.1 install is already stuck:** Settings → Apps → Sokoni Driver → Storage → Clear data, then reopen. The app should reach the Welcome screen. That also confirms the cause was the stored session path.

**To capture the exact error from a USB-connected device:**

```bash
adb logcat -c && adb logcat ReactNativeJS:V ReactNative:V AndroidRuntime:E *:S
```

Then open the app and look for `[driver auth]`, `Unhandled promise rejection`, or `Could not decrypt`.

## 7. Version for this release

This source is **1.0.2** with Android `versionCode 3` in both `app.json` and `android/app/build.gradle`. Play has already consumed version code 2, so every new upload must be higher. If you build with EAS remote version management, check the version code shown for the finished build before uploading; if it is still 2, run `eas build:version:set` for the production profile and rebuild.

## 8. App icon (phones and Play store listing)

The supplied Sokoni Hub Driver artwork is the source for every icon:

- Source: `driver/assets/brand/sokoni-driver-icon-512.jpg`
- Generator: `python3 tools/make-icons.py` (run from `driver/`)

### Why an icon change can "not take" in a production build

This project commits a prebuilt `android/` folder. The launcher reads
`driver/android/app/src/main/res/mipmap-*` directly, so editing `app.json` alone changes
nothing until a fresh `expo prebuild` runs. `tools/make-icons.py` therefore writes both
the app-level assets and the native mipmaps, which is what actually ships.

### What is generated

| File | Purpose |
| --- | --- |
| `assets/icon.png` | 1024×1024 full badge — legacy Android, iOS, fallback |
| `assets/adaptive-icon.png` | 1024×1024 transparent foreground (scooter + pin) |
| `assets/android-icon-monochrome.png` | Android 13+ themed-icon silhouette |
| `assets/brand-mark.png` | 512×512 in-app logo used on Welcome / sign-in |
| `store/play-icon-512.png` | 512×512 PNG, no alpha, for the Play Console listing |
| `android/.../mipmap-{m,h,x,xx,xxx}dpi/` | 48–192 px legacy, round and adaptive foreground, plus monochrome |

Adaptive icons are masked by the launcher, so an adaptive icon cannot carry the
"Sokoni Hub / Driver" lettering: the outer ring is cropped on circle and squircle
launchers and the words become illegible. The adaptive foreground is therefore the
scooter + location-pin mark on white. The full badge is used for the legacy icon, the
iOS icon and the Play listing icon, where nothing is masked.

### After changing the artwork

```bash
cd driver
python3 tools/make-icons.py   # needs pillow, numpy, scipy (and opencv-python for corner fill)
npx tsc --noEmit
```

Then rebuild the release AAB. On a device, the launcher may cache the old icon; if so,
uninstall and reinstall, or clear the launcher's cache.

### Play Console

Upload `driver/store/play-icon-512.png` at **Main store listing → App icon** (512×512,
32-bit PNG, no transparency). A new icon applies to the store listing immediately after
review; the launcher icon on a phone only changes when the user installs the update that
contains it.
