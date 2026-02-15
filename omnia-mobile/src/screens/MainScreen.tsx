import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { auth as firebaseAuth, db } from '../services/firebase';
import { metaWearablesService } from '../services/metaWearables';
import { colors } from '../theme';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

// Explicitly type auth to avoid TypeScript errors
const auth: Auth = firebaseAuth;

// Import device images
const evenImage = require('../assets/even.png');
const metaImage = require('../assets/meta.png');
const vusixImage = require('../assets/vusix.png');

interface Device {
  id: string;
  deviceName: string;
  status: 'online' | 'offline' | 'pending';
  battery?: number;
  model?: string;
  type?: string;
  deviceType?: string;
  pairedAt?: any;
  location?: {
    lat: number;
    lng: number;
  };
  pairedPersonaId?: string;
  battery_left?: number;
  battery_right?: number;
  lastBatteryUpdate?: any;
  bleDeviceId?: string;
  bleDeviceName?: string;
  bleDeviceId_left?: string;
  bleDeviceName_left?: string;
  bleDeviceId_right?: string;
  bleDeviceName_right?: string;
  protocol?: string;
  glassesState?: 'on' | 'off';
}

export default function MainScreen() {
  const navigation = useNavigation();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [userInitials, setUserInitials] = useState<string>('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metaDeviceNames, setMetaDeviceNames] = useState<Record<string, string>>({});
  const isManualRefreshRef = useRef(false);
  const metaSdkInitializedRef = useRef(false);

  // Initialize Meta SDK once
  useEffect(() => {
    const initMetaSDK = async () => {
      if (metaSdkInitializedRef.current || !metaWearablesService.isSDKAvailable()) {
        return;
      }

      try {
        console.log('[MainScreen] Initializing Meta Wearables SDK...');
        await metaWearablesService.initializeSDK();
        metaSdkInitializedRef.current = true;
        console.log('[MainScreen] Meta Wearables SDK initialized successfully');
      } catch (error) {
        console.error('[MainScreen] Failed to initialize Meta SDK:', error);
      }
    };

    initMetaSDK();
  }, []);

  // Fetch profile photo
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoadingPhoto(false);
      return;
    }

    // First check Firebase Auth photoURL
    if (user.photoURL) {
      setProfilePhotoUrl(user.photoURL);
      setLoadingPhoto(false);
      return;
    }

    // Then check Firestore user document
    const userDocRef = doc(db, 'users', user.uid);

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      userDocRef,
      (userDoc) => {
        const currentUser = auth.currentUser;

        // Check Firebase Auth photoURL first (takes priority)
        if (currentUser?.photoURL) {
          setProfilePhotoUrl(currentUser.photoURL);
        } else if (userDoc.exists()) {
          const userData = userDoc.data();

          // Check for photoURL in Firestore
          if (userData.photoUrl || userData.photoURL) {
            setProfilePhotoUrl(userData.photoUrl || userData.photoURL);
          } else {
            setProfilePhotoUrl(null);
          }

          // Set initials from first and last name
          if (userData.firstName && userData.lastName) {
            const initials = `${userData.firstName.charAt(0)}${userData.lastName.charAt(0)}`.toUpperCase();
            setUserInitials(initials);
          } else if (userData.email || currentUser?.email) {
            const email = userData.email || currentUser?.email || '';
            const initials = email.charAt(0).toUpperCase();
            setUserInitials(initials);
          }
        } else {
          // No Firestore document, try to get initials from Auth
          if (currentUser?.email) {
            const initials = currentUser.email.charAt(0).toUpperCase();
            setUserInitials(initials);
          }
        }
        setLoadingPhoto(false);
      },
      (error) => {
        console.error('Error fetching user profile:', error);
        setLoadingPhoto(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch devices
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoadingDevices(false);
      return;
    }

    const devicesRef = collection(db, 'devices');
    const q = query(devicesRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const devicesData: Device[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          devicesData.push({
            id: doc.id,
            deviceName: data.name || 'Unknown Device',
            status: data.status || 'offline',
            battery: data.battery,
            battery_left: data.battery_left,
            battery_right: data.battery_right,
            lastBatteryUpdate: data.lastBatteryUpdate,
            model: data.metadata?.model || data.model,
            type: data.type || data.metadata?.type,
            deviceType: data.deviceType || data.metadata?.deviceType,
            pairedAt: data.pairedAt || data.metadata?.pairedAt,
            location: data.location,
            pairedPersonaId: data.pairedPersonaId,
            bleDeviceId: data.bleDeviceId,
            bleDeviceName: data.bleDeviceName,
            bleDeviceId_left: data.bleDeviceId_left,
            bleDeviceName_left: data.bleDeviceName_left,
            bleDeviceId_right: data.bleDeviceId_right,
            bleDeviceName_right: data.bleDeviceName_right,
            protocol: data.protocol,
            glassesState: data.glassesState,
          });
        });

        // Sort manually by paired date (newest first)
        devicesData.sort((a, b) => {
          try {
            const dateA = a.pairedAt?.toDate ? a.pairedAt.toDate().getTime() :
                         a.pairedAt ? new Date(a.pairedAt).getTime() : 0;
            const dateB = b.pairedAt?.toDate ? b.pairedAt.toDate().getTime() :
                         b.pairedAt ? new Date(b.pairedAt).getTime() : 0;
            return dateB - dateA;
          } catch {
            return 0;
          }
        });

        setDevices(devicesData);
        setLoadingDevices(false);
        if (isManualRefreshRef.current) {
          setRefreshing(false);
          isManualRefreshRef.current = false;
        }

        // Fetch Meta device names for Meta wearable devices
        fetchMetaDeviceNames(devicesData);
      },
      (error) => {
        console.error('Error listening to devices:', error);
        setLoadingDevices(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const fetchMetaDeviceNames = async (devicesList: Device[]) => {
    // Filter for Meta wearable devices
    const metaDevices = devicesList.filter(
      (device) => device.deviceType === 'meta-wearables' || device.type === 'meta-wearables'
    );

    console.log('[MainScreen] fetchMetaDeviceNames - found', metaDevices.length, 'Meta devices');

    if (metaDevices.length === 0) {
      return;
    }

    // Check if Meta Wearables SDK is available
    if (!metaWearablesService.isSDKAvailable()) {
      console.log('[MainScreen] Meta SDK not available');
      return;
    }

    // Wait a bit for SDK to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try to fetch device info for display names
    try {
      console.log('[MainScreen] Fetching Meta device info...');
      const connectionStatus = await metaWearablesService.getConnectionStatus();
      console.log('[MainScreen] Connection status:', connectionStatus);

      // If we have a device name from SDK, update it
      if (connectionStatus.deviceName) {
        console.log('[MainScreen] Updating device name:', connectionStatus.deviceName);
        metaDevices.forEach((device) => {
          setMetaDeviceNames((prev) => ({
            ...prev,
            [device.id]: connectionStatus.deviceName || device.deviceName,
          }));
        });
      }
    } catch (error) {
      console.error('[MainScreen] Error fetching Meta device info:', error);
    }
  };

  const onRefresh = async () => {
    isManualRefreshRef.current = true;
    setRefreshing(true);

    // Re-fetch Meta device info on refresh
    if (devices.length > 0) {
      await fetchMetaDeviceNames(devices);
    }

    // The real-time listener will automatically update and clear refreshing state
    // If no devices or Meta devices, manually clear refreshing
    if (devices.length === 0) {
      setRefreshing(false);
    }
  };

  const handlePairDevice = () => {
    navigation.navigate('Pairing' as never);
  };

  const handleAccountPress = () => {
    navigation.navigate('Account' as never);
  };

  const handleDevicePress = (device: Device) => {
    (navigation as any).navigate('BLEConnection', {
      deviceId: device.id,
      deviceName: device.deviceName,
      savedBleDeviceId_left: device.bleDeviceId_left,
      savedBleDeviceId_right: device.bleDeviceId_right,
    });
  };

  const handleTestPersona = (device: Device) => {
    if (!device.pairedPersonaId) {
      Alert.alert('No Persona', 'This device does not have a persona assigned.');
      return;
    }

    // Navigate to chat screen
    (navigation as any).navigate('Chat', {
      deviceId: device.id,
      deviceName: device.deviceName,
      personaId: device.pairedPersonaId,
    });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      return 'Unknown';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return colors.success;
      case 'pending':
        return colors.warning;
      default:
        return colors.textTertiary;
    }
  };

  const getStatusBackgroundColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'rgba(48, 209, 88, 0.12)';
      case 'pending':
        return 'rgba(255, 159, 10, 0.12)';
      default:
        return 'rgba(99, 99, 102, 0.12)';
    }
  };

  const getDeviceImage = (model?: string, type?: string, deviceType?: string) => {
    // Check type first (most specific), then deviceType, then model
    const checkValue = type || deviceType || model;

    if (!checkValue) return null;

    const valueLower = checkValue.toLowerCase().replace(/_/g, '-');

    // Map device types/models to images - check for even-realities-g1 first (most specific)
    if (valueLower.includes('even-realities-g1') || valueLower.includes('even') || valueLower.includes('g1')) {
      return evenImage;
    } else if (valueLower.includes('meta') || valueLower.includes('quest') || valueLower.includes('ray-ban')) {
      return metaImage;
    } else if (valueLower.includes('vusix')) {
      return vusixImage;
    }

    // Default fallback - return even if no match
    return evenImage;
  };

  return (
    <View style={styles.container}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />

      {/* Profile Icon - Top Right */}
      <TouchableOpacity style={styles.profileButton} onPress={handleAccountPress}>
        <View style={styles.profileIcon}>
          {loadingPhoto ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={styles.profileImage}
              resizeMode="cover"
              onError={() => {
                setProfilePhotoUrl(null);
              }}
            />
          ) : (
            <Text style={styles.profileIconText}>{userInitials}</Text>
          )}
        </View>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.appName}>SpecTask</Text>
          <Text style={styles.subtitle}>Manage your smart glasses devices</Text>
        </View>

        {/* Pair New Device Button - Always visible */}
        <TouchableOpacity onPress={handlePairDevice} style={styles.pairButton}>
          <View style={styles.pairButtonInner}>
            <Text style={styles.pairButtonText}>Pair New Device</Text>
          </View>
        </TouchableOpacity>

        {/* Devices List */}
        {loadingDevices ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading devices...</Text>
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No devices paired</Text>
            <Text style={styles.emptyText}>
              Use the button above to pair your first device
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.devicesSectionTitle}>
              My Devices({devices.length})
            </Text>
            {devices.map((device) => {
              const deviceImage = getDeviceImage(device.model, device.type, device.deviceType);
              const isMetaDevice = device.deviceType === 'meta-wearables' || device.type === 'meta-wearables';

              // Use Firestore status for all devices (including Meta)
              // The SDK registration state doesn't reflect actual Bluetooth connectivity
              const displayStatus = device.status;

              return (
                <TouchableOpacity
                  key={device.id}
                  onPress={() => handleDevicePress(device)}
                  activeOpacity={0.7}
                >
                  <GlassCard style={styles.deviceCard}>
                  <View style={styles.deviceCardContent}>
                    {/* Device Image - Left Side */}
                    {deviceImage && (
                      <View style={styles.deviceImageContainer}>
                        <Image
                          source={deviceImage}
                          style={styles.deviceImage}
                          resizeMode="contain"
                        />
                      </View>
                    )}

                    {/* Device Info - Right Side */}
                    <View style={styles.deviceInfoContainer}>
                      <View style={styles.deviceHeader}>
                        <View style={styles.deviceTitleRow}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {isMetaDevice && metaDeviceNames[device.id]
                              ? metaDeviceNames[device.id]
                              : device.deviceName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.deviceInfo}>
                        {device.battery !== undefined && (
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Battery:</Text>
                            <View style={styles.batteryContainer}>
                              <View style={styles.batteryBar}>
                                <View
                                  style={[
                                    styles.batteryFill,
                                    {
                                      width: `${device.battery}%`,
                                      backgroundColor:
                                        device.battery > 50
                                          ? colors.success
                                          : device.battery > 20
                                          ? colors.warning
                                          : colors.destructive,
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={styles.batteryText}>{device.battery}%</Text>
                            </View>
                          </View>
                        )}

                        {device.pairedAt && (
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Paired:</Text>
                            <Text style={styles.infoValue}>{formatDate(device.pairedAt)}</Text>
                          </View>
                        )}

                        {device.pairedPersonaId && (
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Persona:</Text>
                            <View style={styles.personaBadge}>
                              <Text style={styles.personaText}>Assigned</Text>
                            </View>
                          </View>
                        )}

                        {/* Test Persona Button */}
                        {device.pairedPersonaId && (
                          <TouchableOpacity
                            style={styles.testPersonaButton}
                            onPress={() => handleTestPersona(device)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.testPersonaButtonText}>Chat with Persona</Text>
                          </TouchableOpacity>
                        )}

                      {displayStatus && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Status:</Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: getStatusBackgroundColor(displayStatus) },
                            ]}
                          >
                            <View
                              style={[styles.statusDot, { backgroundColor: getStatusColor(displayStatus) }]}
                            />
                            <Text
                              style={[
                                styles.statusText,
                                { color: getStatusColor(displayStatus) },
                              ]}
                            >
                              {displayStatus.toUpperCase()}
                            </Text>
                          </View>
                          </View>
                      )}

                      {(device.bleDeviceId_left || device.bleDeviceId_right) && (displayStatus === 'online') && (
                        <View style={styles.bleConnectionSection}>
                          <Text style={styles.bleConnectionTitle}>BLE Connection:</Text>
                          <View style={styles.bleArmsRow}>
                            {device.bleDeviceId_left && (
                              <View style={styles.bleArmIndicator}>
                                <View style={styles.bleArmDot} />
                                <Text style={styles.bleArmText}>Left</Text>
                              </View>
                            )}
                            {device.bleDeviceId_right && (
                              <View style={styles.bleArmIndicator}>
                                <View style={styles.bleArmDot} />
                                <Text style={styles.bleArmText}>Right</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}

                      {(device.battery_left != null || device.battery_right != null) &&  (displayStatus === 'online') && (
                        <View style={styles.batterySection}>
                          <Text style={styles.bleConnectionTitle}>Glasses Battery:</Text>

                          {/* Left Arm Battery */}
                          {device.battery_left != null && (
                            <View style={styles.armBatteryRow}>
                              <Text style={styles.armBatteryLabel}>Left:</Text>
                              <View style={styles.batteryContainer}>
                                <View style={styles.batteryBar}>
                                  <View
                                    style={[
                                      styles.batteryFill,
                                      {
                                        width: `${device.battery_left}%`,
                                        backgroundColor:
                                          device.battery_left > 50
                                            ? colors.success
                                            : device.battery_left > 20
                                            ? colors.warning
                                            : colors.destructive,
                                      },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.batteryText}>{device.battery_left}%</Text>
                              </View>
                            </View>
                          )}

                          {/* Right Arm Battery */}
                          {device.battery_right != null && (
                            <View style={styles.armBatteryRow}>
                              <Text style={styles.armBatteryLabel}>Right:</Text>
                              <View style={styles.batteryContainer}>
                                <View style={styles.batteryBar}>
                                  <View
                                    style={[
                                      styles.batteryFill,
                                      {
                                        width: `${device.battery_right}%`,
                                        backgroundColor:
                                          device.battery_right > 50
                                            ? colors.success
                                            : device.battery_right > 20
                                            ? colors.warning
                                            : colors.destructive,
                                      },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.batteryText}>{device.battery_right}%</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                      </View>
                    </View>
                  </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  pairButton: {
    marginBottom: 24,
  },
  pairButtonInner: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  pairButtonText: {
    color: '#09090F',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  devicesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  deviceCard: {
    padding: 16,
    marginBottom: 16,
  },
  deviceCardContent: {
    flexDirection: 'row',
    gap: 16,
  },
  deviceImageContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  deviceImage: {
    width: '100%',
    height: '100%',
  },
  deviceInfoContainer: {
    flex: 1,
    minWidth: 0, // Allows text to truncate properly
  },
  deviceHeader: {
    marginBottom: 12,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deviceModel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deviceInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginLeft: 16,
  },
  batteryBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 4,
  },
  batteryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 35,
    textAlign: 'right',
  },
  personaBadge: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  personaText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  bleConnectionSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  bleConnectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 6,
  },
  bleArmsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bleArmIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bleArmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 4,
  },
  bleArmText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  batterySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  armBatteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  armBatteryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    width: 45,
    marginRight: 8,
  },
  testPersonaButton: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  testPersonaButtonText: {
    color: '#09090F',
    fontSize: 14,
    fontWeight: '600',
  },
});
