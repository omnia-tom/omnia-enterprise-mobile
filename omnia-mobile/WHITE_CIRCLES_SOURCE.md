# Where the White Circles Screen Comes From

The white screen with light gray grid and three concentric circles can originate from these places:

---

## 1. Native iOS Launch Screen (Primary Suspect)

**Location:** `ios/omniamobile/SplashScreen.storyboard`

**Flow:**
- `Info.plist` line 89–90: `UILaunchStoryboardName` = `"SplashScreen"`
- iOS shows this storyboard before any JS runs
- Storyboard uses **SplashScreenLegacy** image and **SplashScreenBackground** color

**Image asset:**
```
ios/omniamobile/Images.xcassets/SplashScreenLegacy.imageset/
├── Contents.json
└── splash-image.png   ← THIS IMAGE IS WHAT YOU SEE
```

**Background color:**
```
ios/omniamobile/Images.xcassets/SplashScreenBackground.colorset/
└── Contents.json   (currently dark #0D0D12)
```

**If the circles are on a white background**, the issue is likely:
- **splash-image.png** – the image file may itself contain a white background with circles (e.g. old Expo default)
- This file is produced by `npx expo prebuild` from `app.json` → `splash.image` → `assets/splash-icon.png`

**Fix:** Replace `splash-image.png` with your Dakkota logo and ensure it has a transparent or dark background, then rebuild.

---

## 2. Source of splash-image.png

**Config:**
- `app.json` → `expo.splash.image` = `"./assets/splash-icon.png"`
- During `npx expo prebuild`, that image is copied into the iOS asset catalog

**Files to inspect:**
```
omnia-mobile/assets/splash-icon.png        ← Source (used by prebuild)
omnia-mobile/ios/.../SplashScreenLegacy.imageset/splash-image.png  ← Native copy
```

**Fix:** Ensure `assets/splash-icon.png` is your Dakkota logo (no white circles). Then run:

```bash
npx expo prebuild --clean
```

---

## 3. Expo Dev Launcher (Development Only)

**When:** You run the app via `npx expo run:ios` and use a dev build. The Dev Client can show its own screens **before** your app loads.

**Android:** `node_modules/expo-dev-launcher/android/.../DevLauncherSplashScreen.kt`  
- Sets `Color.WHITE` background  
- Adds an `ImageView` (Expo logo)

**iOS:** Dev launcher shows a project list / “Connecting to Metro” UI. Its UI is SwiftUI and typically shows status indicators (circles for “active” servers). The white circles may come from this UI.

**Location in code:**
```
node_modules/expo-dev-launcher/ios/SwiftUI/
├── DevLauncherViews.swift   (Circle() for server status dots)
├── DevServersView.swift
└── Navigation/Navigation.swift
```

**Note:** This shows when the Dev Client is waiting for Metro or loading the bundle. It’s expected in dev and is not configurable without ejecting or forking.

---

## 4. React Native Dev Loading View

**Location:** `node_modules/react-native/React/CoreModules/RCTDevLoadingView.mm`

**When:** Shown during bundle download (“Downloading…”, “Connecting to Metro”).

The Expo Dev Client replaces this with `DevClientNoOpLoadingView` when loading the launcher, so your project normally uses this for its own bundle loading.

---

## 5. expo-splash-screen

**Module:** `expo-splash-screen`  
- Uses the same native launch assets (SplashScreen storyboard / image)
- `SplashScreen.hideAsync()` hides that native splash
- It does **not** define the white circles; it only controls when the native splash is hidden

---

## Summary: Most Likely Cause

1. **Production / release builds:** The image file  
   `ios/omniamobile/Images.xcassets/SplashScreenLegacy.imageset/splash-image.png`  
   likely still contains the old Expo default (white + circles) instead of your Dakkota logo.

2. **Dev builds:** The Expo Dev Client “Connecting to Metro” / loading UI can show a white background and status circles.

---

## How to Fix the Native Splash

1. **Inspect the image:**
   ```bash
   open omnia-mobile/ios/omniamobile/Images.xcassets/SplashScreenLegacy.imageset/splash-image.png
   ```
   If you see white + circles, replace it with your Dakkota logo (dark or transparent background).

2. **Regenerate native project from assets:**
   - Ensure `assets/splash-icon.png` is your Dakkota logo.
   - Run:
     ```bash
     cd omnia-mobile
     npx expo prebuild --clean
     ```

3. **Clean build:**
   ```bash
   rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/omniamobile-*
   npx expo run:ios
   ```

4. **Remove app from device/simulator** before reinstalling, so cached launch assets are cleared.
