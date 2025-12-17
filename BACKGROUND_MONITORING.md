# Background BLE Monitoring

This document explains how background monitoring works for detecting glasses ON/OFF status even when the app is in the background.

## Overview

The app monitors connected Even Realities G1 glasses and automatically updates the device status in Firebase when:
- Glasses are put ON or taken OFF
- BLE connection is lost (out of range, battery dead, etc.)

## How It Works

### 1. Initial Connection
When you connect to your glasses (both left and right arms), the app:
- Establishes BLE connections to both arms
- Saves connection info to Firebase
- **Starts background monitoring** for status changes

### 2. Background Monitoring
Once connected, the BLE monitors:
- Continue running even when app is in background (iOS) or backgrounded (Android)
- Listen for glasses ON/OFF events from the BLE protocol
- Detect disconnection events when connection is lost
- Automatically update Firebase when status changes

### 3. Status Updates

**Glasses ON Event:**
- Glasses send BLE event: 0xF5 0x06
- Monitor receives event and updates Firebase:
  - `status: 'online'`
  - `glassesState: 'on'`
  - `lastSeen: <timestamp>`

**Glasses OFF Event:**
- Glasses send BLE event: 0xF5 0x07
- Monitor receives event and updates Firebase:
  - `status: 'offline'`
  - `glassesState: 'off'`
  - `lastSeen: <timestamp>`

**Connection Lost:**
- BLE disconnection detected (out of range, battery dead, etc.)
- Monitor receives disconnection callback and updates Firebase:
  - `status: 'offline'`
  - `glassesState: 'off'`
  - `lastSeen: <timestamp>`

## Platform Support

### iOS
- **Supported with iOS Behavior** ✅
- Background BLE works with `bluetooth-central` background mode
- **State Restoration** enabled - iOS wakes app when BLE events occur
- Connection is maintained when app is backgrounded
- **Important iOS Behavior:**
  - When app is backgrounded, JavaScript execution is suspended
  - When BLE event occurs, iOS **wakes up the app** temporarily
  - JavaScript runs to process the event and update Firebase
  - App may be suspended again after ~10 seconds of inactivity
  - Events are processed immediately, not batched

### Android
- **Supported with Limitations** ⚠️
- Requires foreground service notification
- Connection maintained while app is in background
- May be killed by aggressive battery optimization
- User should disable battery optimization for the app

## Configuration

### iOS (app.json)
```json
"UIBackgroundModes": [
  "bluetooth-central",  // Allows BLE in background
  "processing",         // Background tasks
  "fetch"              // Periodic updates
]
```

### Android (app.json)
```json
"permissions": [
  "android.permission.FOREGROUND_SERVICE",  // Required for background BLE
  "android.permission.WAKE_LOCK"            // Keep device awake for BLE
]
```

## Code Structure

### Files
- **`src/screens/BLEConnectionScreen.tsx`**: Main BLE connection and monitoring
  - Sets up RX characteristic monitors for each arm (line ~642)
  - Handles glasses ON/OFF events (lines ~752-791)
  - Sets up disconnect listeners (line ~826)
  - Updates Firebase on all status changes

### Key Implementation Details

**RX Characteristic Monitoring:**
```typescript
rxChar.monitor((error, characteristic) => {
  // Handle disconnection
  if (error && error.message.includes('disconnected')) {
    // Update Firebase to offline
    updateDoc(deviceDocRef, { status: 'offline', ... });
  }

  // Parse and handle BLE events
  const parsed = deviceProtocol.parseIncomingData(uint8Data);
  if (parsed.type === 'glasses_on') {
    // Update Firebase to online
  }
});
```

**Disconnect Monitoring:**
```typescript
device.onDisconnected((error, device) => {
  // Update Firebase to offline when connection is lost
  updateDoc(deviceDocRef, { status: 'offline', ... });
});
```

### BLE Protocol Events
The service monitors these events:
- `glasses_on` (0xF5 0x06): Sets status to 'online'
- `glasses_off` (0xF5 0x07): Sets status to 'offline'
- `battery_info_response` (0x2C): Updates battery levels

## Testing

### Proper Testing Procedure:

**Prerequisites:**
1. Rebuild app with new configuration: `npx expo run:ios --device`
2. Connect iPhone to Mac with cable
3. Open Xcode → Window → Devices and Simulators → Select device → Open Console
4. Filter console by "BLE-BACKGROUND"

**Test Steps:**

1. **Connect to Glasses** (App in Foreground)
   - Open the app
   - Connect to Even Realities G1 (both arms)
   - Wait for "Background monitoring active" message
   - Verify in console: `[BLE-BACKGROUND] App woken up by iOS for BLE event`

2. **Background the App**
   - Press iPhone home button (do NOT force close)
   - App goes to background
   - BLE connections remain active

3. **Trigger Event While Backgrounded**
   - Close the glasses (take them off)
   - **Wait 5-10 seconds**
   - iOS should wake up the app

4. **Check Console** (This is critical!)
   You should see in Xcode console:
   ```
   [BLE-BACKGROUND] App woken up by iOS for BLE event
   [BLE-BACKGROUND] Glasses turned OFF - updating Firebase
   [BLE-BACKGROUND] Firebase updated: status=offline
   ```

5. **Check Firebase Console**
   - Open Firebase Console in browser
   - Navigate to your device document
   - Verify `status` is now "offline"
   - Verify `lastSeen` timestamp is recent (within last minute)

6. **Test Glasses ON Event**
   - Put glasses back on (while app still backgrounded)
   - Wait 5-10 seconds
   - Check console for:
     ```
     [BLE-BACKGROUND] Glasses turned ON - updating Firebase
     [BLE-BACKGROUND] Firebase updated: status=online
     ```
   - Check Firebase Console - status should be "online"

7. **Test Connection Loss**
   - With app backgrounded, walk far away from glasses (or turn off glasses Bluetooth)
   - Wait for disconnect (may take 30-60 seconds)
   - Check console for:
     ```
     [BLE-BACKGROUND] left arm disconnected
     [BLE-BACKGROUND] Firebase updated on disconnect: status=offline
     ```

### Expected Behavior:
- ✅ Console shows app being woken up by iOS
- ✅ Firebase updates appear in console within 1-2 seconds
- ✅ Firebase Console shows updated status within 5-10 seconds
- ⚠️ If you don't see console logs, the app wasn't rebuilt with new permissions

### Debugging
Check Xcode console (iOS) or Android Studio logcat for background activity:
```
[BLE-BACKGROUND] Glasses turned ON - updating Firebase
[BLE-BACKGROUND] Firebase updated: status=online

[BLE-BACKGROUND] Glasses turned OFF - updating Firebase
[BLE-BACKGROUND] Firebase updated: status=offline

[BLE-BACKGROUND] left arm disconnected
[BLE-BACKGROUND] Firebase updated on disconnect: status=offline
```

To monitor in real-time:
- **iOS**: Connect device to Mac, open Xcode → Window → Devices and Simulators → Select your device → Open Console
- **Android**: `adb logcat | grep BLE-BACKGROUND`

## Limitations

1. **Connection Required**
   - Background monitoring only works if BLE connection is established
   - If glasses go out of range, connection will drop
   - When connection drops, monitoring stops

2. **Battery Impact**
   - Maintaining BLE connections uses battery
   - iOS optimizes this automatically
   - Android may consume more battery

3. **Range**
   - BLE has limited range (~10-30 meters)
   - Connection may drop if phone is too far from glasses

4. **App Termination**
   - If user force-quits the app, monitoring stops
   - On next app launch, need to reconnect to restart monitoring

## Future Enhancements

Potential improvements:
- [ ] Add reconnection logic if connection drops
- [ ] Implement foreground service for Android with notification
- [ ] Add battery level monitoring in background
- [ ] Store events locally if Firebase is unreachable
- [ ] Add user setting to enable/disable background monitoring

## Troubleshooting

### Not Seeing Console Logs?

**Problem:** No `[BLE-BACKGROUND]` logs appear when backgrounded

**Solutions:**
1. **Rebuild Required!** Run `npx expo run:ios --device`
   - The state restoration requires native rebuild
   - Expo Go will NOT work for this feature
2. Check Xcode console is filtering correctly
3. Verify app is backgrounded, not force-closed

### Background Updates Not Working?

**Problem:** Console shows events but Firebase not updating

**Check:**
1. Firebase permissions - ensure app can write to Firestore
2. Internet connection - background writes require connectivity
3. Check Firebase Console directly (not just the app UI)
4. Look for error messages in console

**Verify with these logs:**
```
✅ [BLE-BACKGROUND] Firebase updated: status=offline  <- Should see this
❌ Error updating status: [permission denied]        <- Should NOT see this
```

### App Not Waking Up?

**Problem:** No `[BLE-BACKGROUND] App woken up` logs

**Causes:**
1. **App was force-closed** - Swipe up in app switcher kills background monitoring
   - Solution: Just press home button, don't force close
2. **State restoration not enabled** - Need to rebuild app
3. **BLE connection already dropped** - Check if glasses are in range

### Status Only Updates When Returning to App?

**This is normal iOS behavior IF:**
- Events are queued while app is suspended
- All queued events process when app wakes up
- Firebase writes complete before app suspends again

**This should happen:**
- iOS wakes app immediately when BLE event occurs
- Firebase updates in background
- Status is current even without opening app

### Connection Loss Not Detected?

**Problem:** Walk away from glasses, status stays "online"

**Explanation:**
- BLE disconnection can take 30-60 seconds to detect
- iOS uses connection timeout intervals
- Not instant like WiFi disconnection

**Verify:**
1. Wait at least 60 seconds after going out of range
2. Check console for disconnect event
3. If no disconnect after 2 minutes, connection wasn't properly established

### Glasses Events Not Being Received?

**Problem:** Close glasses, no event in console

**Check:**
1. Glasses firmware version - ensure it sends 0xF5 0x07 events
2. BLE connection is actually established (both arms)
3. In app, close glasses - do you see the event?
   - If YES in foreground but NO in background → state restoration issue
   - If NO in foreground → glasses not sending events or protocol issue
