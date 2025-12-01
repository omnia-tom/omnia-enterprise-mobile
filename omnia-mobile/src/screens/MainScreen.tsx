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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { auth as firebaseAuth, db } from '../services/firebase';

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
}

export default function MainScreen() {
  const navigation = useNavigation();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [userInitials, setUserInitials] = useState<string>('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isManualRefreshRef = useRef(false);

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
            model: data.metadata?.model || data.model,
            type: data.type || data.metadata?.type,
            deviceType: data.deviceType || data.metadata?.deviceType,
            pairedAt: data.pairedAt || data.metadata?.pairedAt,
            location: data.location,
            pairedPersonaId: data.pairedPersonaId,
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
      },
      (error) => {
        console.error('Error listening to devices:', error);
        setLoadingDevices(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    isManualRefreshRef.current = true;
    setRefreshing(true);
    // The real-time listener will automatically update and clear refreshing state
  };

  const handlePairDevice = () => {
    navigation.navigate('Pairing' as never);
  };

  const handleAccountPress = () => {
    navigation.navigate('Account' as never);
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
        return '#4CAF50';
      case 'pending':
        return '#FFC107';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusBackgroundColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'rgba(76, 175, 80, 0.2)';
      case 'pending':
        return 'rgba(255, 193, 7, 0.2)';
      default:
        return 'rgba(158, 158, 158, 0.2)';
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
    <LinearGradient
      colors={['#FFFFFF', '#E0E7FF', '#EDE9FE']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <StatusBar style="dark" />

      {/* Profile Icon - Top Right */}
      <TouchableOpacity style={styles.profileButton} onPress={handleAccountPress}>
        <View style={styles.profileIcon}>
          {loadingPhoto ? (
            <ActivityIndicator size="small" color="#6366F1" />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.appName}>Omnia</Text>
          <Text style={styles.subtitle}>Manage your smart glasses devices</Text>
        </View>

        {/* Pair New Device Button - Always visible */}
        <TouchableOpacity onPress={handlePairDevice} style={styles.pairButton}>
          <LinearGradient
            colors={['#6366F1', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pairButtonGradient}
          >
            <Text style={styles.pairButtonText}>Pair New Device</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Devices List */}
        {loadingDevices ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
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
              My Devices ({devices.length})
            </Text>
            {devices.map((device) => {
              const deviceImage = getDeviceImage(device.model, device.type, device.deviceType);
              return (
                <View key={device.id} style={styles.deviceCard}>
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
                          <Text style={styles.deviceName} numberOfLines={1}>{device.deviceName}</Text>
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
                                          ? '#4CAF50'
                                          : device.battery > 20
                                          ? '#FFC107'
                                          : '#FF6B6B',
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

                      {device.status && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Status:</Text>
                        <View style={styles.infoRow}
                            style={[
                              styles.statusBadge,
                              { backgroundColor: getStatusBackgroundColor(device.status) },
                            ]}
                          >
                            <View
                              style={[styles.statusDot, { backgroundColor: getStatusColor(device.status) }]}
                            />
                            <Text
                              style={[
                                styles.statusText,
                                { color: getStatusColor(device.status) },
                              ]}
                            >
                              {device.status.toUpperCase()}
                            </Text>
                          </View>
                          </View>
                      )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
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
    color: '#6B7280',
    marginBottom: 4,
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  pairButton: {
    marginBottom: 24,
  },
  pairButtonGradient: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  pairButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
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
    color: '#1F2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  devicesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  deviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
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
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
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
    color: '#1F2937',
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
    color: '#6B7280',
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
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    color: '#1F2937',
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
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
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
    color: '#1F2937',
    minWidth: 35,
    textAlign: 'right',
  },
  personaBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  personaText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
});
