import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration for Omnia Enterprise Portal
// Configuration loaded from .env file via babel-plugin-inline-dotenv
// Create a .env file with your Firebase credentials (copy from .env.example)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const isPlaceholder = (val: string | undefined) =>
  !val || val === 'your_api_key_here' || val === 'your_sender_id_here';

export const isFirebaseConfigured =
  !isPlaceholder(firebaseConfig.apiKey) && !isPlaceholder(firebaseConfig.appId);

// Initialize Firebase only if configured; otherwise the app shows a setup screen
let app: ReturnType<typeof initializeApp> | null = null;
if (isFirebaseConfigured) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0]!;
  }
}

// Initialize Auth with AsyncStorage persistence for React Native (only when Firebase is configured)
let auth: Auth;
let db: ReturnType<typeof getFirestore>;

if (app) {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error) {
    auth = getAuth(app);
  }
  db = getFirestore(app);
} else {
  // Stub - app will show Firebase setup screen; these should not be used
  auth = null as unknown as Auth;
  db = null as unknown as ReturnType<typeof getFirestore>;
}

export { auth, db };
export default app;
