# omnia-enterprise-mobile

# Omnia Mobile App - Technical Specifications

## Overview

React Native mobile application for pairing and managing Even Realities G1 smart glasses with the Omnia Enterprise platform. Provides QR-based pairing, real-time device status tracking, and persona-based AI chat functionality.

## Style Reference
Refer to the style reference for the design of applications to be consistent with the web portal

## Tech Stack

- **Framework**: Expo SDK 51+ (Managed Workflow)
- **Language**: TypeScript
- **Backend**: Firebase (Authentication + Firestore)
- **Bluetooth**: react-native-ble-plx
- **QR Scanner**: expo-barcode-scanner
- **Background Tasks**: expo-task-manager + expo-background-fetch
- **Location**: expo-location

## Project Setup

### 1. Create New Expo Project

```bash
npx create-expo-app@latest omnia-mobile --template expo-template-blank-typescript
cd omnia-mobile
```

### 2. Install Dependencies

```bash
# Core dependencies
npm install firebase
npm install react-native-ble-plx
npm install expo-barcode-scanner
npm install expo-task-manager
npm install expo-background-fetch
npm install expo-location
npm install expo-device

# UI Components (optional - or use React Native Paper/NativeBase)
npm install @react-navigation/native
npm install @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
```

### 3. Configure app.json

```json
{
  "expo": {
    "name": "Omnia",
    "slug": "omnia-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1A0C46"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.omnia.mobile",
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "This app needs Bluetooth to connect to your smart glasses.",
        "NSBluetoothPeripheralUsageDescription": "This app needs Bluetooth to connect to your smart glasses.",
        "NSLocationAlwaysUsageDescription": "This app tracks device location for employee activity logs.",
        "NSLocationWhenInUseUsageDescription": "This app tracks device location for employee activity logs.",
        "UIBackgroundModes": ["location", "bluetooth-central"]
      }
    },
    "android": {
      "package": "com.omnia.mobile",
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN"
      ]
    },
    "plugins": [
      [
        "expo-barcode-scanner",
        {
          "cameraPermission": "Allow Omnia to access your camera to scan pairing QR codes."
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow Omnia to track device location for activity logs."
        }
      ]
    ]
  }
}
```

## Architecture

### File Structure

```
omnia-mobile/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx           # Firebase Auth login
│   │   ├── PairingScreen.tsx         # QR scanner + Bluetooth pairing
│   │   ├── ChatScreen.tsx            # Persona-based chat interface
│   │   └── DeviceStatusScreen.tsx    # Device info, battery, status
│   ├── services/
│   │   ├── firebase.ts               # Firebase initialization
│   │   ├── bluetooth.ts              # BLE pairing logic
│   │   ├── backgroundTasks.ts        # Status update background service
│   │   └── api.ts                    # API calls to backend
│   ├── components/
│   │   ├── QRScanner.tsx
│   │   ├── ChatBubble.tsx
│   │   └── DeviceStatusCard.tsx
│   └── types/
│       └── index.ts                  # TypeScript types
├── App.tsx
├── app.json
└── package.json
```

## Core Features Implementation

### 1. Authentication (LoginScreen.tsx)

```typescript
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

const handleLogin = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // Navigate to PairingScreen or ChatScreen
  } catch (error) {
    console.error('Login error:', error);
  }
};
```

**Same credentials as web portal** - no separate registration needed.

### 2. QR Code Scanning (PairingScreen.tsx)

```typescript
import { BarCodeScanner } from 'expo-barcode-scanner';

const handleBarCodeScanned = async ({ data }: { data: string }) => {
  // data = pairing code (e.g., "ABC123")

  try {
    // Step 1: Validate pairing code with backend
    const response = await fetch(`${API_URL}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingCode: data,
        userId: auth.currentUser?.uid,
        deviceName: 'Even Realities G1',
        metadata: {
          model: 'G1',
          firmware: await getDeviceFirmwareVersion(), // From BLE
        },
      }),
    });

    const result = await response.json();

    if (result.success) {
      // Step 2: Start Bluetooth pairing
      await connectToGlasses(result.deviceId);
    }
  } catch (error) {
    console.error('Pairing error:', error);
  }
};
```

### 3. Bluetooth Pairing (services/bluetooth.ts)

```typescript
import { BleManager, Device } from 'react-native-ble-plx';

const bleManager = new BleManager();

export const connectToGlasses = async (deviceId: string) => {
  try {
    // Step 1: Start scanning for Even Realities G1
    bleManager.startDeviceScan(
      null, // Service UUIDs (get from Even Realities docs)
      null,
      (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

        // Step 2: Filter for G1 glasses by name/UUID
        if (device?.name?.includes('G1') || device?.name?.includes('Even')) {
          bleManager.stopDeviceScan();

          // Step 3: Connect to device
          device.connect()
            .then((connectedDevice) => {
              console.log('Connected to glasses:', connectedDevice.id);

              // Step 4: Store device ID locally
              AsyncStorage.setItem('pairedDeviceId', deviceId);
              AsyncStorage.setItem('bleDeviceId', connectedDevice.id);

              // Step 5: Start background status updates
              startBackgroundStatusUpdates(deviceId);
            })
            .catch((err) => {
              console.error('Connection error:', err);
            });
        }
      }
    );
  } catch (error) {
    console.error('Bluetooth pairing error:', error);
  }
};
```

**Note:** You'll need the exact Bluetooth service UUIDs from Even Realities G1 documentation.

### 4. Background Status Updates (services/backgroundTasks.ts)

```typescript
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const BACKGROUND_STATUS_UPDATE = 'BACKGROUND_STATUS_UPDATE';

// Define background task
TaskManager.defineTask(BACKGROUND_STATUS_UPDATE, async () => {
  try {
    const deviceId = await AsyncStorage.getItem('pairedDeviceId');
    if (!deviceId) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Get battery level
    const batteryLevel = await Device.getBatteryLevelAsync();

    // Get location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // Update Firestore via API
    await fetch(`${API_URL}/api/devices/${deviceId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery: Math.round(batteryLevel * 100),
        location: {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        },
        status: 'online',
      }),
    });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background update error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register background task (call after pairing)
export const startBackgroundStatusUpdates = async (deviceId: string) => {
  await BackgroundFetch.registerTaskAsync(BACKGROUND_STATUS_UPDATE, {
    minimumInterval: 120, // 2 minutes (in seconds)
    stopOnTerminate: false,
    startOnBoot: true,
  });
};
```

### 5. Persona-Based Chat (ChatScreen.tsx)

```typescript
import { useState } from 'react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const ChatScreen = () => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  const sendMessage = async () => {
    const deviceId = await AsyncStorage.getItem('pairedDeviceId');

    try {
      const response = await fetch(`${API_URL}/api/devices/${deviceId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const result = await response.json();

      // Add to chat history
      setChatHistory([
        ...chatHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: result.answer },
      ]);

      setMessage('');
    } catch (error) {
      console.error('Chat error:', error);
    }
  };

  return (
    // Chat UI with FlatList for messages
    // TextInput for user input
    // Send button calls sendMessage()
  );
};
```

## API Integration

### Base URL

```typescript
const API_URL = 'https://omnia-api-447424955509.us-central1.run.app';
```

### Required Endpoints (Already Implemented)

1. **POST** `/api/devices/pair`
   - Body: `{ pairingCode, userId, deviceName, metadata }`
   - Returns: `{ success, deviceId, message }`

2. **POST** `/api/devices/:id/status`
   - Body: `{ battery, location, status }`
   - Returns: `{ success }`

3. **POST** `/api/devices/:id/chat`
   - Body: `{ message }`
   - Returns: `{ answer, citations }`

## Firebase Configuration

### services/firebase.ts

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "omnia-enterprise-portal.firebaseapp.com",
  projectId: "omnia-enterprise-portal",
  storageBucket: "omnia-enterprise-portal.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

## Bluetooth Pairing Flow

### Even Realities G1 Specific
Reference the following repositories to understand the bluetooth protocols to display information on the glasses:
https://github.com/even-realities/EvenDemoApp
https://github.com/Oliemanq/DisplayPlus

I have personally used the DisplayPlus as a reference to connect and display content to the glasses.

1. **Check Permissions**
   ```typescript
   const { status } = await PermissionsAndroid.request(
     PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
   );
   ```

2. **Scan for Devices**
   - Look for device name containing "G1" or "Even"
   - Or use specific service UUID from Even Realities SDK docs

3. **Connect**
   ```typescript
   await device.connect();
   await device.discoverAllServicesAndCharacteristics();
   ```

4. **Read Device Info**
   ```typescript
   const firmware = await device.readCharacteristicForService(
     SERVICE_UUID,
     FIRMWARE_CHARACTERISTIC_UUID
   );
   ```

5. **Maintain Connection**
   - Monitor connection state
   - Reconnect if disconnected
   - Update status in backend

## Location Tracking

### Employee Activity Logs

```typescript
// In background task
const location = await Location.getCurrentPositionAsync();

// Store in Firestore activity log
await addDoc(collection(db, `devices/${deviceId}/activityLogs`), {
  type: 'location_update',
  data: {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    timestamp: new Date(),
  },
  timestamp: serverTimestamp(),
});
```

**Privacy Considerations:**
- Get explicit user consent for location tracking
- Only track when device is actively paired
- Allow users to disable tracking in settings
- Comply with GDPR/privacy regulations

## Question Logging

### Track User Interactions

```typescript
// After each chat message
await addDoc(collection(db, `devices/${deviceId}/activityLogs`), {
  type: 'question_asked',
  data: {
    question: message.substring(0, 100), // Truncate for privacy
    personaId: device.pairedPersonaId,
    timestamp: new Date(),
  },
  timestamp: serverTimestamp(),
});
```

This is automatically handled by the backend in the `/api/devices/:id/chat` endpoint.

## Real-time Status Sync

### Listen for Device Changes

```typescript
import { onSnapshot, doc } from 'firebase/firestore';

useEffect(() => {
  const deviceId = await AsyncStorage.getItem('pairedDeviceId');

  const unsubscribe = onSnapshot(
    doc(db, 'devices', deviceId),
    (snapshot) => {
      const deviceData = snapshot.data();

      // Update local state
      setDeviceStatus(deviceData.status);
      setAssignedPersona(deviceData.pairedPersonaId);
    }
  );

  return () => unsubscribe();
}, []);
```

## Testing

### Local Development

1. **iOS Simulator**
   ```bash
   npx expo start --ios
   ```
   Note: Bluetooth won't work in simulator - use physical device

2. **Android Emulator**
   ```bash
   npx expo start --android
   ```

3. **Physical Device (Recommended)**
   ```bash
   npx expo start
   # Scan QR code with Expo Go app
   ```

### Bluetooth Testing Without Glasses

Use a Bluetooth LE peripheral simulator:
- iOS: nRF Connect app
- Android: BLE Peripheral Simulator

## Deployment

### iOS (TestFlight)

```bash
eas build --platform ios
eas submit --platform ios
```

### Android (Google Play Internal Testing)

```bash
eas build --platform android
eas submit --platform android
```

### EAS Configuration (eas.json)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

## Security Considerations

1. **API Authentication**
   - Include Firebase Auth token in API requests
   - Validate user owns device before pairing

2. **Pairing Code Security**
   - 15-minute expiration (enforced by backend)
   - One-time use only
   - Secure transmission (HTTPS only)

3. **Data Privacy**
   - Encrypt chat history locally (react-native-encrypted-storage)
   - Don't log full user questions (truncate to 100 chars)
   - Get consent for location tracking

4. **Bluetooth Security**
   - Use encrypted BLE connections
   - Validate device before trusting connection

## Performance Optimization

1. **Background Tasks**
   - Use BackgroundFetch instead of constant polling
   - Batch updates when possible
   - Handle low battery scenarios

2. **Chat History**
   - Limit to last 50 messages
   - Implement pagination for older messages
   - Cache locally with AsyncStorage

3. **Bluetooth**
   - Disconnect when app backgrounded (save battery)
   - Reconnect on foreground
   - Monitor connection quality

## Troubleshooting

### Common Issues

1. **Pairing Code Invalid**
   - Check if code expired (15 minutes)
   - Verify backend API is accessible
   - Ensure Firebase Auth is working

2. **Bluetooth Connection Fails**
   - Check permissions granted
   - Verify Bluetooth is enabled
   - Ensure glasses are in pairing mode
   - Check for interference from other devices

3. **Background Updates Not Working**
   - iOS: Check Background App Refresh is enabled
   - Android: Disable battery optimization for app
   - Verify location permissions granted

4. **Chat Not Working**
   - Check if persona is assigned to device
   - Verify API connectivity
   - Check Firebase Auth token is valid

## Next Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/omnia-mobile.git
   cd omnia-mobile
   npm install
   ```

2. **Get Even Realities SDK**
   - Contact Even Realities for G1 SDK
   - Get Bluetooth service UUIDs
   - Review pairing documentation

3. **Setup Firebase**
   - Add `google-services.json` (Android)
   - Add `GoogleService-Info.plist` (iOS)

4. **Start Development**
   ```bash
   npx expo start
   ```

## Support

For questions or issues:
- Backend API: [API README](/api/README.md)
- Web Portal: [CLAUDE.md](/CLAUDE.md)
- Even Realities G1: https://evenrealities.com/support

---

**Version**: 1.0.0
**Last Updated**: 2025-11-08
**Platforms**: iOS 13+, Android 8+
