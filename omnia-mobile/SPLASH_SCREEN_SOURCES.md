# Where the White Splash (Grid + Concentric Circles) Comes From

The white screen with a light gray grid and three concentric circles can come from **two places**:

## 1. Expo Dev Client — Connection Screen (most likely in dev)

When running `npx expo run:ios` or using a dev build, **expo-dev-client** shows its own loading UI while waiting for Metro. This screen often has a white background and circular loading indicator. It appears **before** your app’s native splash.

- **Location**: Built into `node_modules/expo-dev-client` (native iOS/Android code)
- **When**: Before the app connects to Metro and loads your JS bundle
- **Fix**: Ensure Metro is running (`npx expo start`) and the device can reach it; use `--tunnel` if needed. This screen is expected in development.

## 2. Native iOS Launch Screen

The native storyboard splash shown after the dev client connects but before React mounts.

## Source Locations (native splash)

| Location | Purpose |
|----------|---------|
| **`ios/omniamobile/Info.plist`** | `UILaunchStoryboardName: SplashScreen` — tells iOS which storyboard to use at launch |
| **`ios/omniamobile/SplashScreen.storyboard`** | Defines the launch UI: `SplashScreenLegacy` image + `SplashScreenBackground` color |
| **`ios/omniamobile/Images.xcassets/SplashScreenLegacy.imageset/`** | The image shown (splash-image.png) |
| **`ios/omniamobile/Images.xcassets/SplashScreenBackground.colorset/`** | Background color |

## Why You May Still See the Old Screen

1. **Stale build** — Xcode/device cached the old assets. Do a **clean build** and **delete the app** from the simulator/device before reinstalling.
2. **Native assets not updated** — Ensure `SplashScreenLegacy.imageset/splash-image.png` is the Dakkota logo and `SplashScreenBackground.colorset` uses dark `#0D0D12`.

## How to Fully Regenerate (Nuclear Option)

```bash
cd omnia-mobile
npx expo prebuild --clean
```

This regenerates the `ios/` folder from `app.json`. Our `app.json` now has:
- `splash.backgroundColor: "#0D0D12"`
- `splash.image: "./assets/splash-icon.png"` (Dakkota logo)

**Warning:** This will overwrite native customizations. Do this only if manual fixes didn't work.
