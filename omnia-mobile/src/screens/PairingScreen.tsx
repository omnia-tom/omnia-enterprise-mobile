import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { metaWearablesService, MetaDevice } from '../services/metaWearables';
import { colors, typography, cardStyle, spacing } from '../theme';

export default function PairingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [discovering, setDiscovering] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<MetaDevice[]>([]);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    initSDK();

    metaWearablesService.addEventListener('deviceFound', handleDeviceFound);
    metaWearablesService.addEventListener('pairingComplete', handlePairingComplete);
    metaWearablesService.addEventListener('error', handleError);

    return () => {
      metaWearablesService.removeEventListener('deviceFound', handleDeviceFound);
      metaWearablesService.removeEventListener('pairingComplete', handlePairingComplete);
      metaWearablesService.removeEventListener('error', handleError);
      if (discovering) {
        metaWearablesService.stopDiscovery().catch(() => {});
      }
    };
  }, []);

  // Handle deep links from Meta AI app OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url.includes('metaWearablesAction') && metaWearablesService.isSDKAvailable()) {
        try {
          await metaWearablesService.handleUrl(event.url);
        } catch (error: any) {
          Alert.alert('Registration Error', error.message || 'Failed to complete registration');
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  const initSDK = async () => {
    if (!metaWearablesService.isSDKAvailable()) return;
    try {
      await metaWearablesService.initializeSDK();
      setSdkReady(true);
    } catch (error: any) {
      if (error.message?.includes('already configured')) {
        setSdkReady(true);
      }
    }
  };

  const handleDeviceFound = (device: MetaDevice) => {
    setDevices(prev => {
      if (prev.find(d => d.id === device.id)) return prev;
      return [...prev, device];
    });
  };

  const handlePairingComplete = (data: { success: boolean }) => {
    if (!data.success) {
      setDiscovering(false);
      Alert.alert('Registration Failed', 'Failed to register with Meta glasses');
    }
  };

  const handleError = (error: { code: string; message: string }) => {
    setDiscovering(false);
    setConnecting(false);
  };

  const startScan = async () => {
    if (!metaWearablesService.isSDKAvailable()) {
      Alert.alert('Not Available', 'Meta Wearables SDK is not available on this device.');
      return;
    }

    try {
      setDiscovering(true);
      setDevices([]);
      await metaWearablesService.startPairing('');
    } catch (error: any) {
      if (error.message?.includes('NOT_REGISTERED')) {
        Alert.alert('Registration Required', 'Complete the pairing in the Meta AI app, then try again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to scan for devices');
      }
      setDiscovering(false);
    }
  };

  const stopScan = async () => {
    try {
      await metaWearablesService.stopDiscovery();
    } catch {}
    setDiscovering(false);
  };

  const selectDevice = async (device: MetaDevice) => {
    setConnecting(true);
    try {
      await metaWearablesService.connectToDevice(device.id);
      await metaWearablesService.stopDiscovery().catch(() => {});
      setDiscovering(false);

      // Go back — TaskDetailScreen will re-check connection status
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Could not connect to glasses');
    } finally {
      setConnecting(false);
    }
  };

  const sdkAvailable = metaWearablesService.isSDKAvailable();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backArrow}>{'‹'}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Connect Glasses</Text>
      <Text style={styles.subtitle}>
        Scan for nearby Meta Ray-Ban glasses and select yours
      </Text>

      {!sdkAvailable ? (
        <View style={styles.center}>
          <Text style={styles.unavailableText}>
            Meta Wearables SDK is not available on this device.
          </Text>
        </View>
      ) : (
        <>
          {/* Scan button */}
          {!discovering ? (
            <TouchableOpacity
              style={styles.scanButton}
              onPress={startScan}
              activeOpacity={0.8}
              disabled={connecting}
            >
              <Text style={styles.scanButtonText}>Scan for Glasses</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.scanningRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.scanningText}>Scanning...</Text>
              <TouchableOpacity style={styles.stopButton} onPress={stopScan}>
                <Text style={styles.stopButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Device list */}
          <ScrollView style={styles.deviceList} contentContainerStyle={styles.deviceListContent}>
            {devices.length === 0 && discovering && (
              <Text style={styles.hintText}>
                Make sure your Meta glasses are nearby, charged, and paired with the Meta View app.
              </Text>
            )}
            {devices.length === 0 && !discovering && (
              <Text style={styles.hintText}>
                Tap "Scan for Glasses" to find nearby devices.
              </Text>
            )}

            {devices.map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                onPress={() => selectDevice(device)}
                activeOpacity={0.7}
                disabled={connecting}
              >
                <View style={styles.deviceIcon}>
                  <Text style={styles.deviceEmoji}>🕶️</Text>
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name || 'Meta Glasses'}</Text>
                  {device.model && <Text style={styles.deviceModel}>{device.model}</Text>}
                </View>
                {connecting ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.connectLabel}>Connect</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* How-to card */}
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>First time?</Text>
            <Text style={styles.helpStep}>1. Pair your glasses with the Meta View app first</Text>
            <Text style={styles.helpStep}>2. Make sure Bluetooth is on</Text>
            <Text style={styles.helpStep}>3. Tap "Scan for Glasses" above</Text>
            <Text style={styles.helpStep}>4. Select your glasses from the list</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 36,
    fontWeight: '300',
    color: colors.accent,
    lineHeight: 36,
  },
  title: {
    ...typography.display,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screenPadding,
  },
  unavailableText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  scanButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: spacing.screenPadding,
    alignItems: 'center',
    marginBottom: 20,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: spacing.screenPadding,
    marginBottom: 20,
    paddingVertical: 12,
  },
  scanningText: {
    ...typography.callout,
    color: colors.textSecondary,
    flex: 1,
  },
  stopButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.destructive,
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  deviceList: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  deviceListContent: {
    gap: 10,
    paddingBottom: 16,
  },
  hintText: {
    ...typography.callout,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
  },
  deviceCard: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  deviceEmoji: {
    fontSize: 24,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    ...typography.title2,
    marginBottom: 2,
  },
  deviceModel: {
    ...typography.caption1,
    color: colors.textTertiary,
  },
  connectLabel: {
    ...typography.caption1,
    color: colors.accent,
    fontWeight: '600',
  },
  helpCard: {
    ...cardStyle,
    margin: spacing.screenPadding,
    padding: spacing.cardPadding,
  },
  helpTitle: {
    ...typography.title2,
    marginBottom: 10,
  },
  helpStep: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
});
