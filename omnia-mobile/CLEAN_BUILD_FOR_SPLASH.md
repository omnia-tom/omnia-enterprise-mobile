# Fix White/Circle Screen on Launch

## What Was Restored

- **Dakkota splash**: Mesh background + logo (same as before) — shown while auth loads
- **Native splash**: `splash-image.png` and `splash-icon.png` use the Dakkota logo on dark `#0D0D12` background
- `hideSplash()` runs as soon as our React splash renders, so the native view is replaced quickly

## If You Still See White + Circles

### 1. Expo Dev Client (development only)

When running `npx expo run:ios`, the **Expo Dev Client** shows a "Connecting to Metro" screen **before** your app. That screen can have a white background and circles. It is built into `expo-dev-client` and not configurable.

**Ways to reduce it:**
- **Start Metro first:** Run `npx expo start`, then open the app. Metro is ready sooner.
- **Production build:** `npx expo run:ios --no-dev` (no Dev Client UI).

### 2. Stale native splash cache

If the old Expo default splash is cached:

```bash
cd omnia-mobile

# Remove app from simulator/device
# Then clean and rebuild:
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData/omniamobile-*

# Ensure splash assets are correct
cp src/assets/dakkota-logo.png assets/splash-icon.png
cp src/assets/dakkota-logo.png ios/omniamobile/Images.xcassets/SplashScreenLegacy.imageset/splash-image.png

# Rebuild
npx expo run:ios
```

### 3. Full native reset (if nothing else works)

```bash
cd omnia-mobile
npx expo prebuild --clean
# Then: npx expo run:ios
```

**Warning:** `prebuild --clean` regenerates the `ios/` folder and can overwrite native changes.
