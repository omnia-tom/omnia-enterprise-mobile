import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

interface Device {
  id: string;
  deviceName: string;
  status: 'online' | 'offline' | 'pending';
  battery?: number;
  model?: string;
  pairedAt?: any;
  location?: {
    lat: number;
    lng: number;
  };
  pairedPersonaId?: string;
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const fetchDevices = async () => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const devicesRef = collection(db, 'devices');
      
      // Try with orderBy first, fall back to just where if it fails
      let q = query(
        devicesRef,
        where('userId', '==', user.uid),
        orderBy('pairedAt', 'desc')
      );

      try {
        const querySnapshot = await getDocs(q);
        const devicesData: Device[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          devicesData.push({
            id: doc.id,
            deviceName: data.name || 'Unknown Device',
            status: data.status || 'offline',
            battery: data.battery,
            model: data.metadata?.model || data.model,
            pairedAt: data.pairedAt || data.metadata?.pairedAt,
            location: data.location,
            pairedPersonaId: data.pairedPersonaId,
          });
        });

        // Sort manually if orderBy fails
        devicesData.sort((a, b) => {
          const dateA = a.pairedAt?.toDate ? a.pairedAt.toDate().getTime() : 0;
          const dateB = b.pairedAt?.toDate ? b.pairedAt.toDate().getTime() : 0;
          return dateB - dateA;
        });

        setDevices(devicesData);
      } catch (orderError) {
        // If orderBy fails (e.g., missing index), try without it
        console.warn('OrderBy query failed, fetching without order:', orderError);
        q = query(devicesRef, where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const devicesData: Device[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          devicesData.push({
            id: doc.id,
            deviceName: data.deviceName || 'Unknown Device',
            status: data.status || 'offline',
            battery: data.battery,
            model: data.metadata?.model || data.model,
            pairedAt: data.pairedAt || data.metadata?.pairedAt,
            location: data.location,
            pairedPersonaId: data.pairedPersonaId,
          });
        });

        setDevices(devicesData);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDevices();

    // Set up real-time listener for device updates
    const user = auth.currentUser;
    if (!user) return;

    const devicesRef = collection(db, 'devices');
    
    // Use simple query without orderBy to avoid index requirements
    // We'll sort manually
    const q = query(devicesRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const devicesData: Device[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          devicesData.push({
            id: doc.id,
            deviceName: data.deviceName || 'Unknown Device',
            status: data.status || 'offline',
            battery: data.battery,
            model: data.metadata?.model || data.model,
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
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to devices:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevices();
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

  if (loading && devices.length === 0) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#E0E7FF', '#EDE9FE']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      </LinearGradient>
    );
  }

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
        <Text style={styles.title}>My Devices</Text>
        <Text style={styles.subtitle}>
          {devices.length} {devices.length === 1 ? 'device' : 'devices'} paired
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        {devices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👓</Text>
            <Text style={styles.emptyTitle}>No devices found</Text>
            <Text style={styles.emptyText}>
              Pair your first device to get started
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Pairing' as never)}
              style={styles.emptyButton}
            >
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyButtonGradient}
              >
                <Text style={styles.emptyButtonText}>Pair New Device</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          devices.map((device) => (
            <View key={device.id} style={styles.deviceCard}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceTitleRow}>
                  <Text style={styles.deviceName}>{device.deviceName}</Text>
                  <View
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
                {device.model && (
                  <Text style={styles.deviceModel}>{device.model}</Text>
                )}
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
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyButton: {
    width: '100%',
    maxWidth: 300,
  },
  emptyButtonGradient: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  deviceHeader: {
    marginBottom: 16,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 20,
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
    borderColor: 'rgba(99, 102, 241, 0.4)',
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

