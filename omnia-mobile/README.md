# Omnia Mobile App

React Native mobile application for pairing and managing Even Realities G1 smart glasses with the Omnia Enterprise platform.

## Features Implemented

✅ **Login Flow**
- Firebase email/password authentication
- Glassmorphism UI design matching the web portal
- Persistent authentication state
- Error handling for common auth issues

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Expo CLI installed globally: `npm install -g expo-cli`
- iOS Simulator (for Mac) or Android Emulator
- Firebase account with Omnia Enterprise Portal credentials

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**

   You need to add your Firebase configuration credentials to `src/services/firebase.ts`:

   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your "omnia-enterprise-portal" project
   - Go to Project Settings > General
   - Scroll down to "Your apps" and find your web app config
   - Copy the configuration values

   Update `src/services/firebase.ts` with your credentials:
   ```typescript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "omnia-enterprise-portal.firebaseapp.com",
     projectId: "omnia-enterprise-portal",
     storageBucket: "omnia-enterprise-portal.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on a device**
   - **iOS**: Press `i` or run `npm run ios`
   - **Android**: Press `a` or run `npm run android`
   - **Physical device**: Scan the QR code with the Expo Go app

## Project Structure

```
omnia-mobile/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Email/password login
│   │   └── MainScreen.tsx       # Placeholder home screen
│   ├── services/
│   │   └── firebase.ts          # Firebase configuration
│   ├── navigation/
│   │   └── index.tsx            # Navigation setup
│   └── types/
│       └── index.ts             # TypeScript types
├── App.tsx                      # Main app component
└── package.json
```

## Authentication

The app uses Firebase Authentication with email/password. Users should use the **same credentials as the web portal** - no separate registration is needed.

### Login Flow

1. User enters email and password
2. Firebase authenticates against existing user database
3. On success, user is navigated to the main screen
4. Auth state is persisted using AsyncStorage
5. User remains logged in between app sessions

### Error Handling

The login screen handles common Firebase auth errors:
- Invalid email format
- Account disabled
- User not found
- Wrong password
- Too many failed attempts

## Design System

The app follows the glassmorphism design system defined in the project's DESIGN.md:

- **Colors**: Deep purple theme (#1A0C46) with purple accents (#6B4DFF, #A394FF)
- **Effects**: Frosted glass cards with blur effects and purple borders
- **Typography**: White text with gray secondary text
- **Buttons**: Linear gradient purple buttons

## Next Steps

Upcoming features to implement:
- [ ] QR code scanning for device pairing
- [ ] Bluetooth connection to Even Realities G1 glasses
- [ ] Device status tracking (battery, location)
- [ ] Persona-based chat interface
- [ ] Background tasks for status updates
- [ ] Activity logging

## Testing

### Without Physical Glasses

For development without access to Even Realities G1 glasses:
- Use Bluetooth LE simulators (nRF Connect app)
- Mock device pairing flow
- Test UI and authentication flows

### With Expo Go

The easiest way to test:
```bash
npm start
```
Then scan the QR code with the Expo Go app on your iOS or Android device.

## Troubleshooting

### Firebase Authentication Issues

If you encounter authentication errors:
1. Verify your Firebase config is correct in `src/services/firebase.ts`
2. Check that email/password auth is enabled in Firebase Console
3. Ensure you're using valid credentials from the web portal
4. Check the console for specific error codes

### Build Issues

If you encounter dependency issues:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Support

For questions or issues:
- Backend API: See main project README
- Web Portal: See CLAUDE.md
- Even Realities G1: https://evenrealities.com/support

---

**Version**: 1.0.0
**Platform**: iOS 13+, Android 8+
**Framework**: Expo SDK 54
