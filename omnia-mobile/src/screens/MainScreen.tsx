import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function MainScreen() {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.content}>
        <LinearGradient
          colors={['#FFFFFF', '#A394FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoGradient}
        >
          <Text style={styles.logo}>OMNIA</Text>
        </LinearGradient>

        <Text style={styles.title}>Welcome to Omnia</Text>
        <Text style={styles.subtitle}>You're successfully logged in!</Text>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            Next features coming soon:
          </Text>
          <Text style={styles.featureText}>• QR Code Pairing</Text>
          <Text style={styles.featureText}>• Bluetooth Device Connection</Text>
          <Text style={styles.featureText}>• Persona-based Chat</Text>
          <Text style={styles.featureText}>• Device Status Tracking</Text>
        </View>

        <TouchableOpacity onPress={handleSignOut} style={styles.buttonContainer}>
          <LinearGradient
            colors={['#6E40FF', '#A394FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Sign Out</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0C46',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoGradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A0C46',
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#DAD8E6',
    marginBottom: 32,
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(26, 12, 70, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.3)',
    padding: 24,
    width: '100%',
    marginBottom: 32,
    shadowColor: '#6B4DFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 14,
    color: '#DAD8E6',
    marginBottom: 8,
  },
  buttonContainer: {
    width: '100%',
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
