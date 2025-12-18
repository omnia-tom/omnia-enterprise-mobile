# Meta Wearables Implementation Guide

Based on the [CameraAccess sample](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess), this guide explains how to implement the Meta Wearables DAT SDK methods.

## Reference: CameraAccess Sample

The CameraAccess sample demonstrates:
- Device discovery and connection
- Video streaming from Meta AI glasses
- Photo capture functionality
- Device information retrieval

Review the sample code at: https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess

## Implementation Steps

### 1. Review the CameraAccess Sample Code

Clone or browse the repository to see the actual implementation:
```bash
git clone https://github.com/facebook/meta-wearables-dat-ios.git
cd meta-wearables-dat-ios/samples/CameraAccess
```

Key files to review:
- Main view controller that handles device discovery
- Connection manager/delegate implementations
- Video streaming handlers
- Photo capture handlers

### 2. SDK Class Structure (Based on Typical Patterns)

The Meta Wearables DAT SDK typically includes:

**Manager Class:**
- `WearablesManager` or similar - Singleton for managing devices
- Methods: `startDiscovery()`, `stopDiscovery()`, `connect()`, etc.

**Device Class:**
- `WearableDevice` or similar - Represents a connected device
- Properties: `identifier`, `name`, `model`, `batteryLevel`, etc.
- Methods: `startVideoStream()`, `capturePhoto()`, etc.

**Delegates/Protocols:**
- Discovery delegate for found devices
- Connection delegate for connection events
- Video frame delegate for streaming
- Photo capture delegate

### 3. Implementation Pattern for MetaWearablesModule.swift

Based on the CameraAccess sample, here's the typical flow:

#### Device Discovery
```swift
// Pattern from CameraAccess sample
wearablesManager.startDiscovery { [weak self] devices in
  for device in devices {
    // Emit event to React Native
    self?.sendEvent(withName: "onDeviceFound", body: [
      "id": device.identifier,
      "name": device.name,
      "model": device.model
    ])
  }
}
```

#### Device Connection
```swift
// Pattern from CameraAccess sample
wearablesManager.connect(to: deviceId) { [weak self] result in
  switch result {
  case .success(let device):
    self?.currentDevice = device
    // Emit connected event
    self?.sendEvent(withName: "onDeviceConnected", body: [
      "id": device.identifier,
      "name": device.name
    ])
  case .failure(let error):
    // Handle error
  }
}
```

#### Video Streaming
```swift
// Pattern from CameraAccess sample
device.startVideoStream { [weak self] frame in
  // Convert frame to base64
  if let base64 = self?.convertFrameToBase64(frame) {
    self?.sendEvent(withName: "onVideoFrame", body: [
      "data": base64,
      "timestamp": Date().timeIntervalSince1970 * 1000,
      "width": frame.width,
      "height": frame.height
    ])
  }
}
```

#### Photo Capture
```swift
// Pattern from CameraAccess sample
device.capturePhoto { [weak self] result in
  switch result {
  case .success(let photo):
    if let base64 = self?.convertPhotoToBase64(photo) {
      self?.sendEvent(withName: "onPhotoCaptured", body: [
        "data": base64,
        "timestamp": Date().timeIntervalSince1970 * 1000
      ])
    }
  case .failure(let error):
    // Handle error
  }
}
```

### 4. Next Steps

1. **Review the actual CameraAccess sample code** to get exact class names and method signatures
2. **Update MetaWearablesModule.swift** with the actual SDK API calls
3. **Test device discovery** first
4. **Test connection** once discovery works
5. **Implement video streaming** and photo capture

### 5. Common Issues

- **Class names may differ** - Check the actual SDK documentation for exact names
- **Delegates vs callbacks** - The SDK may use delegates, closures, or async/await
- **Thread safety** - Ensure all UI updates happen on main thread
- **Memory management** - Use `[weak self]` in closures to avoid retain cycles

## Current Status

The `MetaWearablesModule.swift` file has been structured with:
- ✅ Proper event emitter setup
- ✅ Method signatures matching React Native bridge
- ✅ Placeholder implementations with comments
- ✅ Error handling structure
- ✅ Base64 conversion helpers (to be implemented)

**You need to:**
1. Review the CameraAccess sample code
2. Replace placeholder code with actual SDK API calls
3. Update class names to match the actual SDK
4. Implement the delegate/callback handlers

## Resources

- [Meta Wearables DAT iOS Repository](https://github.com/facebook/meta-wearables-dat-ios)
- [CameraAccess Sample](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess)
- [Meta Wearables Developer Center](https://developers.facebook.com/products/wearables/)

