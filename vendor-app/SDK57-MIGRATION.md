# Vendor app — Expo SDK 51 → 57 (Google Play API 36)

Play Console blocked the vendor bundle because it targeted **API 34**. From
31 Aug 2026 new apps and updates must target **API 36** (Android 16), and the
extension window closed on 1 Nov 2026. The buyer app (`/mobile`) was already on
SDK 57 and compliant; this brings the vendor app onto the same stack.

## What changed and why

| Change | Reason |
| --- | --- |
| `expo` `~51.0.28` → `~57.0.32` | API 36 needs AGP 8.9.1+/Gradle 8.11+. SDK 51 ships AGP 8.2 / Gradle 8.6 and cannot build against 36. |
| `react-native` `0.74.5` → `0.86.3`, `react` `18.2.0` → `19.2.3` | The versions SDK 57 pins (Expo `bundledNativeModules.json`). |
| All `expo-*` packages bumped to their SDK 57 versions | Mixing SDK 51 modules with 57 breaks autolinking. |
| `expo-build-properties`: `compileSdkVersion: 36`, `targetSdkVersion: 36` | The Play requirement itself. `minSdkVersion: 24` unchanged, so the same phones are supported. |
| `expo-build-properties`: `enableProguardInReleaseBuilds: true` | Clears the "no deobfuscation file" warning. Gradle now runs R8 in release and emits `mapping.txt`, which EAS uploads with the bundle; it also shrinks the app. |
| `android.edgeToEdgeEnabled` removed | Android 16 always draws edge-to-edge at target 36 and the flag is gone from the SDK 57 config schema (expo-doctor rejects it). |
| Splash config moved into the `expo-splash-screen` plugin | The top-level `splash` key is deprecated in SDK 57. |
| `main`: `node_modules/expo/AppEntry.js` → `index.ts` | `App.tsx` called `registerRootComponent` itself *and* `AppEntry.js` called it again. One registration now, in `index.ts`. |
| `.gitignore` added; `.expo/` ignored at the root | `expo-doctor` flagged the machine-specific `.expo` state. |

No screen or business-logic rewrite was needed: the app only touches
notifications, linear-gradient, secure-store, font, device and constants, and
those APIs are unchanged in 57. `App.tsx` is the only source file edited.

## Verify before shipping

```bash
cd vendor-app
npm ci
npx tsc --noEmit          # passes
npx expo-doctor           # 21/21 pass
npx expo prebuild --platform android --no-install   # check gradle.properties
```

`android/gradle.properties` after prebuild should contain:

```
android.minSdkVersion=24
android.compileSdkVersion=36
android.targetSdkVersion=36
android.enableMinifyInReleaseBuilds=true
newArchEnabled=true
```

Then build and upload:

```bash
eas build -p android --profile production
eas submit -p android --profile production
```

## Things to check on the first build

- **New Architecture is on by default** in RN 0.86 (`newArchEnabled=true`). All
  libraries in this app are Expo-maintained, so no known incompatibility — but
  test on a real device.
- **Android 16 edge-to-edge** is enforced at target 36. The app uses
  `SafeAreaProvider`, so insets should hold; check the bottom nav on the Pin,
  Orders and Availability screens against the system gesture bar.
- **Expo push token**: `getExpoPushTokenAsync` needs the EAS `projectId`
  (read from `Constants.expoConfig.extra.eas.projectId`). Run
  `eas init` if `.extra.eas.projectId` is missing, otherwise
  `usePushToken` reports "Alerts are not set up in this app build yet".
- **Android FCM credentials** for SDK 57 are FCM v1 only — make sure the EAS
  project has the Google service account key uploaded.
- **versionCode**: `appVersionSource: remote` in `eas.json`, so EAS owns it.
  Confirm the next build increments past the version already on Play.
