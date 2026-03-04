import React, { useState, useEffect, useCallback } from 'react';
import { View, Image, StyleSheet, Text, ScrollView } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './src/services/firebase';
import Navigation from './src/navigation';
import MeshBackground from './src/components/MeshBackground';

const dakkotaLogo = require('./src/assets/dakkota-logo.png');

const AUTH_TIMEOUT_MS = 8000;

// Keep native splash visible until we hide it (avoids white grid/circles flash)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn('[App] Auth check timeout — proceeding as unauthenticated (offline or network error)');
        setIsAuthenticated(false);
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    try {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setIsAuthenticated(currentUser !== null);
        setLoading(false);
      });
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
        unsubscribe();
      };
    } catch (err) {
      console.error('[App] Auth init error:', err);
      clearTimeout(timeoutId);
      setLoading(false);
      return () => { cancelled = true; };
    }
  }, []);

  // Firebase not configured — show setup instructions instead of white screen
  if (!isFirebaseConfigured) {
    return (
      <View style={styles.setupContainer}>
        <ScrollView contentContainerStyle={styles.setupScroll}>
          <Text style={styles.setupTitle}>Firebase Not Configured</Text>
          <Text style={styles.setupText}>
            Add your Firebase credentials to continue:
          </Text>
          <Text style={styles.setupStep}>1. Copy <Text style={styles.code}>.env.example</Text> to <Text style={styles.code}>.env</Text></Text>
          <Text style={styles.setupStep}>2. Open Firebase Console → Project Settings → General</Text>
          <Text style={styles.setupStep}>3. Replace the placeholder values in <Text style={styles.code}>.env</Text> with your project's API key, project ID, etc.</Text>
          <Text style={styles.setupStep}>4. Rebuild the app (npx expo run:ios)</Text>
          <Text style={styles.setupHint}>The .env file is gitignored and will not be committed.</Text>
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <MeshBackground variant="warm" />
        <View style={styles.splashContent}>
          <Image source={dakkotaLogo} style={styles.splashLogo} resizeMode="contain" />
        </View>
      </View>
    );
  }

  // Hide native splash before showing app content (removes white grid/circles)
  hideSplash();

  return <Navigation isAuthenticated={isAuthenticated} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D0D12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 220,
    height: 56,
  },
  setupContainer: {
    flex: 1,
    backgroundColor: '#0D0D12',
  },
  setupScroll: {
    padding: 24,
    paddingTop: 60,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0F0F5',
    marginBottom: 16,
  },
  setupText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 16,
  },
  setupStep: {
    fontSize: 15,
    color: '#F0F0F5',
    marginBottom: 12,
    lineHeight: 22,
  },
  code: {
    fontFamily: 'Menlo',
    color: '#6366F1',
  },
  setupHint: {
    fontSize: 13,
    color: '#636366',
    marginTop: 24,
  },
});
