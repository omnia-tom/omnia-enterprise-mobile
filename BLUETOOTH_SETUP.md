# Bluetooth Setup Guide

## Important: Development Build Required

The Bluetooth functionality requires a **development build** with native modules. You cannot use Expo Go for Bluetooth features.

## Quick Rebuild Commands

### Option 1: Local Build (Fastest)

**For iOS:**
```bash
cd omnia-mobile
npx expo run:ios --device
```

**For Android:**
```bash
cd omnia-mobile
npx expo run:android --device
```

### Option 2: EAS Build (Cloud Build)

**For iOS:**
```bash
cd omnia-mobile
eas build --profile development --platform ios
```

**For Android:**
```bash
cd omnia-mobile
eas build --profile development --platform android
```

After the build completes, install it on your device, then run:
```bash
cd omnia-mobile
npm start
```

## Why Rebuild is Needed

`react-native-ble-plx` uses native code that must be compiled into your app. Expo Go doesn't include this native module, so you need a custom development build.

## Verifying the Build

After rebuilding and installing:
1. Open the app on your device
2. Navigate to a device card
3. Tap on it to open the BLE connection screen
4. You should see "Initializing Bluetooth..." and then be able to scan

If you still see the error, check:
- ✅ You're running the development build (not Expo Go)
- ✅ The build was completed after installing `react-native-ble-plx`
- ✅ Bluetooth permissions are granted in device settings
- ✅ Bluetooth is enabled on your device

