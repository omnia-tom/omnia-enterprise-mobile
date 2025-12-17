# Building a Production/Standalone App

You can build a standalone app that doesn't require connecting to a Metro bundler. Here are your options:

## Option 1: Build Production Build from Xcode (Easiest)

### In Xcode:
1. Open `ios/omniamobile.xcworkspace`
2. Select **Product → Scheme → Edit Scheme**
3. Change **Build Configuration** from `Debug` to **`Release`**
4. Select your device or "Any iOS Device"
5. Press `Cmd + B` to build (or `Cmd + R` to build and run)

This creates a standalone app with all code bundled - no Metro connection needed!

### To Archive for App Store/TestFlight:
1. Select **Product → Archive**
2. Once archived, the Organizer window opens
3. Click **Distribute App**
4. Choose:
   - **App Store Connect** (for TestFlight/App Store)
   - **Ad Hoc** (for testing on registered devices)
   - **Enterprise** (if you have Enterprise account)

## Option 2: EAS Build (Cloud Build)

Build a production build in the cloud:

```bash
cd omnia-mobile

# Build production iOS
eas build --profile production --platform ios

# Build production Android
eas build --profile production --platform android
```

This creates a standalone `.ipa` (iOS) or `.apk` (Android) file you can distribute.

## Option 3: Build Release Locally

You can also build a release version locally:

```bash
cd omnia-mobile/ios
xcodebuild -workspace omniamobile.xcworkspace \
  -scheme omniamobile \
  -configuration Release \
  -archivePath ./build/omniamobile.xcarchive \
  archive
```

## Differences

| Build Type | Requires Metro? | For |
|------------|----------------|-----|
| Development | ✅ Yes | Development, testing, hot reload |
| Release/Production | ❌ No | App Store, TestFlight, distribution |

## Removing "Development Build" Text

The development build UI is only shown when:
- Using `expo-dev-client` in development mode
- Metro bundler is active

In a **Release/Production build**, this UI doesn't appear - it's a normal standalone app.

## Quick Production Build Steps (Xcode)

1. Open `ios/omniamobile.xcworkspace` in Xcode
2. **Product → Scheme → Edit Scheme**
3. Set **Run → Build Configuration** to `Release`
4. **Product → Archive**
5. **Distribute App** → Choose your distribution method

That's it! No Metro bundler needed.




