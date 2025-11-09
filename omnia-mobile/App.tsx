import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/services/firebase';
import Navigation from './src/navigation';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const authStatus = currentUser !== null;
      console.log('Auth state changed:', authStatus, typeof authStatus);
      setIsAuthenticated(authStatus);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A394FF" />
      </View>
    );
  }

  console.log('Passing isAuthenticated to Navigation:', isAuthenticated, typeof isAuthenticated);
  return <Navigation isAuthenticated={isAuthenticated} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1A0C46',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
