# Meta Wearables Integration Setup Guide

This guide explains how to integrate the Meta Wearables Device Access Toolkit (DAT) SDK into the Omnia mobile app.

## Prerequisites

- Xcode 14.0 or later
- iOS 15.1 or later
- Meta Wearables Developer Account (sign up at [Wearables Developer Center](https://developers.facebook.com/products/wearables/))

## Step 1: Add Meta Wearables SDK via Swift Package Manager

1. Open the project in Xcode:
   ```bash
   cd omnia-mobile/ios
   open omniamobile.xcworkspace
   ```

2. In Xcode, select the **omniamobile** project in the Project Navigator

3. Select the **omniamobile** target

4. Go to the **Package Dependencies** tab

5. Click the **+** button to add a package

6. Enter the package URL:
   ```
   https://github.com/facebook/meta-wearables-dat-ios
   ```

7. Select the version (use the latest stable version)

8. Click **Add Package**

9. Select the **omniamobile** target when prompted

10. Click **Add Package**

## Step 2: Update MetaWearablesModule.swift

Once the SDK is added, you need to uncomment the import and implement the methods:

1. Open `ios/omniamobile/MetaWearablesModule.swift`

2. Uncomment the import:
   ```swift
   import MetaWearablesDAT
   ```

3. Implement the methods using the Meta DAT SDK APIs. Refer to the [Meta Wearables Developer Documentation](https://developers.facebook.com/products/wearables/) for API details.

## Step 3: Configure Info.plist

Add the required permissions and configuration for Meta Wearables:

1. Open `ios/omniamobile/Info.plist` in Xcode

2. Add the following keys (if not already present):
   - `NSBluetoothAlwaysUsageDescription` - Already present
   - `NSBluetoothPeripheralUsageDescription` - Already present
   - `NSCameraUsageDescription` - Required for video streaming
   - `NSMicrophoneUsageDescription` - Already present

3. Add Meta Wearables configuration (if required by the SDK):
   ```xml
   <key>MWDAT</key>
   <dict>
       <key>Analytics</key>
       <dict>
           <key>OptOut</key>
           <false/>
       </dict>
   </dict>
   ```

## Step 4: Rebuild the App

After adding the SDK, you **must** rebuild the app:

```bash
cd omnia-mobile
npx expo run:ios --device
```

Or build via Xcode:
1. Open `omniamobile.xcworkspace` in Xcode
2. Select your device
3. Press `Cmd + B` to build
4. Press `Cmd + R` to run

## Step 5: Test the Integration

1. Open the app on your iOS device
2. Navigate to the Pairing screen
3. Select "Meta Wearables" device type
4. Tap "Start Discovery"
5. Your Meta wearable should appear in the list

## Current Implementation Status

⚠️ **The Meta Wearables integration is currently a skeleton implementation.**

The following components are in place:
- ✅ Native module structure (`MetaWearablesModule.swift` and `.m`)
- ✅ React Native service (`src/services/metaWearables.ts`)
- ✅ UI for device type selection and discovery
- ✅ Pairing flow integration with backend API

**Still needs implementation:**
- ❌ Actual Meta DAT SDK integration in `MetaWearablesModule.swift`
- ❌ Device discovery implementation
- ❌ Pairing flow implementation
- ❌ Video streaming implementation
- ❌ Photo capture implementation

## Meta Wearables SDK Documentation

- [Meta Wearables Developer Center](https://developers.facebook.com/products/wearables/)
- [GitHub Repository](https://github.com/facebook/meta-wearables-dat-ios)
- [Swift Package Documentation](https://github.com/facebook/meta-wearables-dat-ios)

## Troubleshooting

### SDK Not Found
If you see "Meta Wearables SDK not available":
1. Verify the SDK was added via Swift Package Manager
2. Check that the import statement is uncommented
3. Rebuild the app

### Build Errors
If you encounter build errors:
1. Clean build folder: `Cmd + Shift + K` in Xcode
2. Delete derived data
3. Rebuild the project

### Device Not Found
If devices don't appear during discovery:
1. Ensure Meta wearable is powered on
2. Check Bluetooth is enabled
3. Verify the device is in pairing mode
4. Check Meta Wearables app permissions

## Next Steps

Once the SDK is integrated, you'll need to:

1. **Implement device discovery** - Use Meta DAT SDK to scan for devices
2. **Implement pairing** - Handle the Meta pairing flow
3. **Implement video streaming** - Stream video from the wearable
4. **Implement photo capture** - Capture photos from the wearable
5. **Get device information** - Battery, firmware, etc.

Refer to the Meta Wearables DAT SDK documentation for implementation details.

