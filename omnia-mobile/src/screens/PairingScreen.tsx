import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import QRScanner from '../components/QRScanner';
import { auth } from '../services/firebase';

const API_URL = process.env.API_URL || 'https://omnia-api-447424955509.us-central1.run.app';

export default function PairingScreen() {
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const navigation = useNavigation();

  const handleQRCodeScanned = async (data: string) => {
    setPairingCode(data);
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in to pair a device');
        setLoading(false);
        return;
      }

      // Get Firebase ID token for authentication
      const idToken = await user.getIdToken();

      // Call pairing API
      const response = await fetch(`${API_URL}/api/devices/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          pairingCode: data,
          userId: user.uid,
          deviceName: 'Even Realities G1',
          metadata: {
            model: 'G1',
            pairedAt: new Date().toISOString(),
          },
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert(
          'Success!',
          'Device paired successfully',
          [
            {
              text: 'OK',
              onPress: () => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('Main' as never);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Pairing Failed', result.message || 'Failed to pair device');
      }
    } catch (error: any) {
      console.error('Pairing error:', error);
      Alert.alert('Error', error.message || 'An error occurred during pairing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#E0E7FF', '#EDE9FE']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Main' as never);
            }
          }}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Pair Device</Text>
        <Text style={styles.subtitle}>Scan QR code from your device</Text>
      </View>

      {/* QR Scanner */}
      <View style={styles.scannerContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Pairing device...</Text>
            {pairingCode && (
              <Text style={styles.codeText}>Code: {pairingCode}</Text>
            )}
          </View>
        ) : (
          <QRScanner onScan={handleQRCodeScanned} />
        )}
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How to pair:</Text>
        <Text style={styles.infoText}>1. Turn on your Even Realities G1 glasses</Text>
        <Text style={styles.infoText}>2. Navigate to pairing mode</Text>
        <Text style={styles.infoText}>3. Display the QR code on the glasses</Text>
        <Text style={styles.infoText}>4. Scan the QR code with this app</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  scannerContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  codeText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    padding: 20,
    margin: 16,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
});
