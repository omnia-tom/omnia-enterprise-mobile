import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import QRScanner from '../components/QRScanner';
import { auth } from '../services/firebase';
import { metaWearablesService, MetaDevice } from '../services/metaWearables';

const API_URL = process.env.API_URL || 'https://omnia-api-447424955509.us-central1.run.app';

type DeviceType = 'even-realities-g1' | 'meta-wearables';

export default function PairingScreen() {
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [deviceType, setDeviceType] = useState<DeviceType>('even-realities-g1');
  const [discoveringMeta, setDiscoveringMeta] = useState(false);
  const [metaDevices, setMetaDevices] = useState<MetaDevice[]>([]);
  const navigation = useNavigation();

  useEffect(() => {
    // Initialize SDK once when component mounts
    const initializeMetaSDK = async () => {
      if (metaWearablesService.isSDKAvailable()) {
        try {
          await metaWearablesService.initializeSDK();
          console.log('[PairingScreen] Meta Wearables SDK initialized');
        } catch (error: any) {
          // SDK might already be initialized, which is fine
          if (!error.message?.includes('already configured')) {
            console.error('[PairingScreen] Failed to initialize Meta SDK:', error);
          }
        }
      }
    };

    initializeMetaSDK();

    // Set up event listeners when switching to Meta Wearables
    if (deviceType === 'meta-wearables' && metaWearablesService.isSDKAvailable()) {
      metaWearablesService.addEventListener('deviceFound', handleMetaDeviceFound);
      metaWearablesService.addEventListener('pairingComplete', handleMetaPairingComplete);
      metaWearablesService.addEventListener('error', handleMetaError);

      return () => {
        metaWearablesService.removeAllListeners();
      };
    }
  }, [deviceType]);

  // Handle deep links from Meta AI app OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('[PairingScreen] Received deep link:', url);

      // Check if this is a Meta Wearables callback URL
      // Meta Wearables callbacks contain metaWearablesAction query parameter
      if (url.includes('metaWearablesAction')) {
        console.log('[PairingScreen] Detected Meta Wearables callback, processing...');

        if (metaWearablesService.isSDKAvailable()) {
          try {
            const result = await metaWearablesService.handleUrl(url);
            console.log('[PairingScreen] ✅ Successfully processed Meta Wearables callback:', result);
          } catch (error: any) {
            console.error('[PairingScreen] ❌ Failed to process Meta Wearables callback:', error);
            Alert.alert('Registration Error', error.message || 'Failed to complete registration');
          }
        }
      }
    };

    // Add listener for incoming deep links (when app is already open)
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was launched with a deep link (when app was closed)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleMetaDeviceFound = (device: MetaDevice) => {
    console.log('[PairingScreen] Device found:', device);
    setMetaDevices(prev => {
      // Avoid duplicates
      if (prev.find(d => d.id === device.id)) {
        return prev;
      }
      return [...prev, device];
    });
  };

  const handleMetaPairingComplete = async (data: { success: boolean; deviceId?: string }) => {
    console.log('[PairingScreen] Pairing complete:', data);

    // Registration is complete - devices will now appear via onDeviceFound events
    if (data.success) {
      console.log('[PairingScreen] Registration successful, waiting for devices...');
      // Keep discovering state active so user can see the list populate
    } else {
      setLoading(false);
      setDiscoveringMeta(false);
      Alert.alert('Registration Failed', 'Failed to register with Meta wearable device');
    }
  };

  const handleMetaError = (error: { code: string; message: string }) => {
    console.error('[PairingScreen] Meta Wearables error:', error);
    setLoading(false);
    setDiscoveringMeta(false);
    Alert.alert('Error', error.message || 'An error occurred with Meta Wearables');
  };

  const startMetaDiscovery = async () => {
    if (!metaWearablesService.isSDKAvailable()) {
      Alert.alert(
        'Not Available',
        'Meta Wearables SDK is not available. Please ensure the SDK is integrated in Xcode.'
      );
      return;
    }

    try {
      setDiscoveringMeta(true);
      setMetaDevices([]);

      // For Meta glasses, we need to start pairing/registration first
      // This will open the Meta AI app for confirmation
      console.log('[PairingScreen] Starting Meta registration...');
      await metaWearablesService.startPairing('');

      // Once registered, devices will be discovered automatically via devicesStream
      // The onDeviceFound event will populate the metaDevices list

    } catch (error: any) {
      console.error('Error starting Meta discovery:', error);

      // Check if the error is about already being registered
      if (error.message?.includes('NOT_REGISTERED')) {
        Alert.alert(
          'Registration Required',
          'Please complete the pairing process in the Meta AI app, then try again.'
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to start device discovery');
      }
      setDiscoveringMeta(false);
    }
  };

  const stopMetaDiscovery = async () => {
    try {
      await metaWearablesService.stopDiscovery();
      setDiscoveringMeta(false);
    } catch (error: any) {
      console.error('Error stopping Meta discovery:', error);
    }
  };

  const handleMetaDeviceSelect = async (device: MetaDevice) => {
    console.log('[PairingScreen] handleMetaDeviceSelect called for device:', device);
    setLoading(true);
    try {
      // Connect to the device
      console.log('[PairingScreen] Connecting to device:', device.id);
      await metaWearablesService.connectToDevice(device.id);
      console.log('[PairingScreen] ✅ Successfully connected to device');

      // Pair the device to the backend
      console.log('[PairingScreen] Starting backend pairing...');
      await pairMetaDeviceToBackend(device.id);
    } catch (error: any) {
      console.error('[PairingScreen] ❌ Error in handleMetaDeviceSelect:', error);
      setLoading(false);
      Alert.alert('Error', error.message || 'Failed to connect to device');
    }
  };

  const pairMetaDeviceToBackend = async (deviceId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in to pair a device');
        setLoading(false);
        return;
      }

      const device = metaDevices.find(d => d.id === deviceId);
      console.log('[PairingScreen] Found device for pairing:', device);

      const idToken = await user.getIdToken();

      const requestBody = {
        pairingCode: deviceId, // Use device ID as pairing code for Meta devices
        userId: user.uid,
        deviceName: device?.name || 'Meta Wearable',
        metadata: {
          type: 'meta-wearables',
          model: device?.model,
          firmware: device?.firmware,
          pairedAt: new Date().toISOString(),
        },
      };

      console.log('[PairingScreen] Sending pairing request to backend:', {
        url: `${API_URL}/api/devices/pair`,
        body: requestBody
      });

      const response = await fetch(`${API_URL}/api/devices/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[PairingScreen] Backend response status:', response.status);

      const result = await response.json();
      console.log('[PairingScreen] Backend response body:', result);

      if (response.ok && result.success) {
        await metaWearablesService.stopDiscovery();
        Alert.alert(
          'Success!',
          'Meta wearable paired successfully',
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
      console.error('Error pairing Meta device to backend:', error);
      Alert.alert('Error', error.message || 'An error occurred during pairing');
    } finally {
      setLoading(false);
      setDiscoveringMeta(false);
    }
  };

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

      // Determine device name and metadata based on selected device type
      const deviceName = deviceType === 'even-realities-g1'
        ? 'Even Realities G1'
        : 'Meta Wearable';

      const metadata = deviceType === 'even-realities-g1'
        ? {
            type: 'even-realities-g1',
            model: 'G1',
            pairedAt: new Date().toISOString(),
          }
        : {
            type: 'meta-wearables',
            pairedAt: new Date().toISOString(),
          };

      console.log('[PairingScreen] Pairing with code:', data);
      console.log('[PairingScreen] Device type:', deviceType);
      console.log('[PairingScreen] Device name:', deviceName);

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
          deviceName: deviceName,
          metadata: metadata,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert(
          'Success!',
          `${deviceName} paired successfully`,
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
        Alert.alert('Pairing Failed', result.message || result.error || 'Failed to pair device');
      }
    } catch (error: any) {
      console.error('[PairingScreen] Pairing error:', error);
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
        <Text style={styles.subtitle}>
          Scan the QR code from your web portal
        </Text>
      </View>

      {/* Device Type Selector */}
      <View style={styles.deviceTypeSelector}>
        <TouchableOpacity
          style={[
            styles.deviceTypeButton,
            deviceType === 'even-realities-g1' && styles.deviceTypeButtonActive
          ]}
          onPress={() => setDeviceType('even-realities-g1')}
        >
          <Text style={[
            styles.deviceTypeButtonText,
            deviceType === 'even-realities-g1' && styles.deviceTypeButtonTextActive
          ]}>
            Even Realities G1
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.deviceTypeButton,
            deviceType === 'meta-wearables' && styles.deviceTypeButtonActive
          ]}
          onPress={() => setDeviceType('meta-wearables')}
        >
          <Text style={[
            styles.deviceTypeButtonText,
            deviceType === 'meta-wearables' && styles.deviceTypeButtonTextActive
          ]}>
            Meta Wearables
          </Text>
        </TouchableOpacity>
      </View>

      {/* QR Scanner (for both device types) */}
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
      {deviceType === 'even-realities-g1' && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How to pair Even Realities G1:</Text>
          <Text style={styles.infoText}>1. Log into the Omnia web portal</Text>
          <Text style={styles.infoText}>2. Generate a pairing code for your device</Text>
          <Text style={styles.infoText}>3. Scan the QR code shown on the portal</Text>
          <Text style={styles.infoText}>4. Your device will be paired automatically</Text>
        </View>
      )}

      {deviceType === 'meta-wearables' && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How to pair Meta Wearables:</Text>
          <Text style={styles.infoText}>
            <Text style={styles.boldText}>Step 1:</Text> Pair with Meta View app first
          </Text>
          <Text style={styles.infoText}>1. Download and open the Meta View app</Text>
          <Text style={styles.infoText}>2. Pair your Meta glasses with Meta View</Text>
          <Text style={styles.infoText}>
            <Text style={styles.boldText}>Step 2:</Text> Pair with Omnia
          </Text>
          <Text style={styles.infoText}>3. Log into the Omnia web portal</Text>
          <Text style={styles.infoText}>4. Generate a pairing code for your device</Text>
          <Text style={styles.infoText}>5. Scan the QR code shown on the portal</Text>
          {!metaWearablesService.isSDKAvailable() && (
            <Text style={styles.warningText}>
              ⚠️ Meta Wearables SDK not available. Please integrate the SDK in Xcode.
            </Text>
          )}
        </View>
      )}
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
  warningText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
    fontStyle: 'italic',
  },
  deviceTypeSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  deviceTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    alignItems: 'center',
  },
  deviceTypeButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  deviceTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  deviceTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  metaDiscoverySection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  discoverButton: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  discoverButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  discoveringContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  discoveringText: {
    fontSize: 14,
    color: '#6B7280',
  },
  stopButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  devicesList: {
    maxHeight: 200,
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  deviceItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.2)',
  },
  deviceItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  deviceItemModel: {
    fontSize: 12,
    color: '#6B7280',
  },
  noDevicesContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noDevicesText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '700',
    color: '#1F2937',
  },
});
