import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { pickPackAPI } from '../services/pickPackApi';
import { PickOrder, PickItem } from '../types/pickPack';
import { metaWearablesService, MetaBarcode } from '../services/metaWearables';

export default function PickPackScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickOrder, setPickOrder] = useState<PickOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasConnectedGlasses, setHasConnectedGlasses] = useState(false);
  const [glassesDevice, setGlassesDevice] = useState<any>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    loadPickOrder();
  }, []);

  // Check for connected glasses
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Listen for devices owned by this user that are online
    const devicesQuery = query(
      collection(db, 'devices'),
      where('userId', '==', userId),
      where('status', '==', 'online')
    );

    const unsubscribe = onSnapshot(devicesQuery, (snapshot) => {
      const devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (devices.length > 0) {
        setHasConnectedGlasses(true);
        setGlassesDevice(devices[0]); // Use first connected device
        console.log('[PickPackScreen] Connected glasses found:', devices[0]);
      } else {
        setHasConnectedGlasses(false);
        setGlassesDevice(null);
        console.log('[PickPackScreen] No connected glasses');
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen for barcode detection from Meta glasses
  useEffect(() => {
    const handleBarcodeDetected = async (barcode: MetaBarcode) => {
      // Only process if we have a pick order and glasses are connected
      if (!pickOrder || !hasConnectedGlasses || isProcessingScan) {
        console.log('[PickPackScreen] Ignoring barcode - no order, no glasses, or already processing');
        return;
      }

      // Find the current item (first unscanned item)
      const currentItem = pickOrder.items.find(item => !item.scanned);
      if (!currentItem) {
        console.log('[PickPackScreen] No current item to scan');
        return;
      }

      console.log(`[PickPackScreen] Barcode detected: ${barcode.data} (type: ${barcode.type})`);
      setIsProcessingScan(true);

      try {
        // Submit scan to API for validation
        const response = await pickPackAPI.submitScan(pickOrder.id, barcode.data);

        if (response.success) {
          // Success - provide positive feedback
          console.log('[PickPackScreen] Scan successful!');
          Vibration.vibrate([0, 100, 50, 100]); // Double vibration for success

          setScanFeedback({
            type: 'success',
            message: `✓ ${currentItem.productName} scanned!`,
          });

          // Update the pick order to mark item as scanned
          setPickOrder({
            ...pickOrder,
            items: pickOrder.items.map(item =>
              item.productId === currentItem.productId
                ? { ...item, scanned: true, scannedAt: new Date() }
                : item
            ),
          });

          // Auto-advance to next item after 2 seconds
          setTimeout(() => {
            setScanFeedback(null);
            setIsProcessingScan(false);
          }, 2000);

        } else {
          // Error - wrong item or invalid UPC
          console.log('[PickPackScreen] Scan failed:', response.message);
          Vibration.vibrate([0, 200, 100, 200, 100, 200]); // Triple vibration for error

          setScanFeedback({
            type: 'error',
            message: response.message || '✗ Wrong item scanned',
          });

          // Clear error feedback after 3 seconds
          setTimeout(() => {
            setScanFeedback(null);
            setIsProcessingScan(false);
          }, 3000);
        }
      } catch (error: any) {
        console.error('[PickPackScreen] Error validating scan:', error);
        Vibration.vibrate([0, 200, 100, 200, 100, 200]);

        setScanFeedback({
          type: 'error',
          message: '✗ Scan validation failed',
        });

        setTimeout(() => {
          setScanFeedback(null);
          setIsProcessingScan(false);
        }, 3000);
      }
    };

    // Subscribe to barcode events
    metaWearablesService.addEventListener('barcodeDetected', handleBarcodeDetected);

    // Cleanup
    return () => {
      metaWearablesService.removeEventListener('barcodeDetected', handleBarcodeDetected);
    };
  }, [pickOrder, hasConnectedGlasses, isProcessingScan]);

  const loadPickOrder = async () => {
    try {
      setError(null);
      const userId = auth.currentUser?.uid;

      if (!userId) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      console.log('[PickPackScreen] Loading pick order for user:', userId);
      const order = await pickPackAPI.getUserActivePickOrder(userId);

      if (!order) {
        console.log('[PickPackScreen] No active pick order');
        setPickOrder(null);
      } else {
        console.log('[PickPackScreen] Pick order loaded:', order);
        setPickOrder(order);
      }
    } catch (error: any) {
      console.error('[PickPackScreen] Error loading pick order:', error);
      setError(error.message || 'Failed to load pick order');
      Alert.alert('Error', error.message || 'Failed to load pick order');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPickOrder();
  };

  // Check if all items are scanned and trigger completion
  useEffect(() => {
    if (!pickOrder || isCompletingOrder) return;

    const allScanned = pickOrder.items.every(item => item.scanned);
    const isComplete = pickOrder.status === 'completed';

    // If all items are scanned but order is not marked complete, complete it
    if (allScanned && !isComplete) {
      handleOrderCompletion();
    }
  }, [pickOrder, isCompletingOrder]);

  const handleOrderCompletion = async () => {
    if (!pickOrder || isCompletingOrder) return;

    setIsCompletingOrder(true);

    try {
      console.log('[PickPackScreen] All items scanned - completing order');
      const response = await pickPackAPI.completePickOrder(pickOrder.id);

      if (response.success) {
        console.log('[PickPackScreen] Order completed successfully');
        Vibration.vibrate([0, 100, 50, 100, 50, 100]); // Triple vibration for completion

        // Update local state to mark as completed
        setPickOrder({
          ...pickOrder,
          status: 'completed',
          completedAt: new Date(),
        });

        Alert.alert(
          'Order Complete! 🎉',
          `Pick order completed successfully! Great work.`,
          [{ text: 'OK', onPress: () => loadPickOrder() }]
        );
      }
    } catch (error: any) {
      console.error('[PickPackScreen] Error completing order:', error);
      Alert.alert('Error', 'Failed to complete order. Please try again.');
    } finally {
      setIsCompletingOrder(false);
    }
  };

  const renderProgress = () => {
    if (!pickOrder) return null;

    const currentStep = pickOrder.currentStep + 1; // Convert 0-indexed to 1-indexed
    const totalSteps = pickOrder.items.length;
    const progressPercent = (currentStep / totalSteps) * 100;

    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Progress: {currentStep} of {totalSteps} items
        </Text>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>
    );
  };

  const renderCurrentItem = () => {
    if (!pickOrder || pickOrder.currentStep >= pickOrder.items.length) {
      return null;
    }

    const currentItem: PickItem = pickOrder.items[pickOrder.currentStep];

    return (
      <View style={styles.currentItemCard}>
        <Text style={styles.currentItemLabel}>Current Item:</Text>
        <Text style={styles.currentItemName}>📦 {currentItem.productName}</Text>
        <Text style={styles.currentItemQuantity}>Quantity: {currentItem.quantity}</Text>
        <View style={styles.locationContainer}>
          <Text style={styles.locationLabel}>Location:</Text>
          <Text style={styles.locationText}>
            Aisle {currentItem.location.aisle}, Shelf {currentItem.location.shelf}
          </Text>
          <Text style={styles.locationText}>Bin {currentItem.location.bin}</Text>
        </View>
        <View style={styles.scanPromptContainer}>
          {!scanFeedback && <Text style={styles.scanPromptText}>👓 Ready to scan with glasses</Text>}

          {scanFeedback && (
            <View style={[
              styles.scanFeedbackBanner,
              scanFeedback.type === 'success' ? styles.scanFeedbackSuccess : styles.scanFeedbackError
            ]}>
              <Text style={styles.scanFeedbackText}>{scanFeedback.message}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.startScanButton}
            onPress={() => {
              if (glassesDevice) {
                navigation.navigate('BLEConnection' as never, {
                  deviceId: glassesDevice.id,
                  deviceName: glassesDevice.name || 'Smart Glasses',
                } as never);
              }
            }}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.startScanButtonGradient}
            >
              <Text style={styles.startScanButtonText}>Connect & Start Scanning</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItemList = () => {
    if (!pickOrder) return null;

    return (
      <View style={styles.itemListContainer}>
        <Text style={styles.itemListTitle}>Pick List:</Text>
        {pickOrder.items.map((item, index) => {
          const isScanned = item.scanned;
          const isCurrent = index === pickOrder.currentStep;

          return (
            <View
              key={item.productId}
              style={[
                styles.itemRow,
                isCurrent && styles.itemRowCurrent,
                isScanned && styles.itemRowScanned,
              ]}
            >
              <Text style={styles.itemCheckbox}>
                {isScanned ? '✅' : '🔲'}
              </Text>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, isScanned && styles.itemNameScanned]}>
                  {item.productName}
                </Text>
                <Text style={styles.itemDetails}>
                  Qty: {item.quantity} • {item.location.bin}
                </Text>
              </View>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderNoActiveOrder = () => (
    <View style={styles.noOrderContainer}>
      <Text style={styles.noOrderIcon}>📋</Text>
      <Text style={styles.noOrderTitle}>No Active Pick Order</Text>
      <Text style={styles.noOrderText}>
        You don't have any active pick orders assigned at the moment.
      </Text>
      <Text style={styles.noOrderText}>
        Pull down to refresh and check for new orders.
      </Text>
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading pick order...</Text>
        </View>
      );
    }

    if (error && !pickOrder) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Pull down to retry</Text>
        </View>
      );
    }

    if (!pickOrder) {
      return renderNoActiveOrder();
    }

    if (pickOrder.status === 'completed') {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.completedIcon}>🎉</Text>
          <Text style={styles.completedTitle}>Order Complete!</Text>
          <Text style={styles.completedText}>
            All {pickOrder.items.length} items have been picked.
          </Text>
          <Text style={styles.completedText}>
            Pull down to check for new orders.
          </Text>
        </View>
      );
    }

    // Check if glasses are connected before showing pick order
    if (!hasConnectedGlasses) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.glassesIcon}>👓</Text>
          <Text style={styles.glassesTitle}>Connect Your Glasses</Text>
          <Text style={styles.glassesText}>
            To start picking, please connect your smart glasses first.
          </Text>
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => navigation.navigate('Home' as never)}
          >
            <LinearGradient
              colors={['#6366F1', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.connectButtonGradient}
            >
              <Text style={styles.connectButtonText}>Go to Devices</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    // Extract last 6 characters of pick ID for display
    const shortId = pickOrder.id.slice(-6).toUpperCase();

    return (
      <View style={styles.contentContainer}>
        <View style={styles.orderHeader}>
          <View style={styles.orderTitleContainer}>
            <Text style={styles.orderIdText}>Pick Order</Text>
            <Text style={styles.orderShortId}>#{shortId}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {pickOrder.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        {renderProgress()}
        {renderCurrentItem()}
        {renderItemList()}
      </View>
    );
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#E0E7FF', '#EDE9FE']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
          />
        }
      >
        {renderContent()}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    minHeight: 400,
  },
  contentContainer: {
    flex: 1,
  },
  // Order Header
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  orderIdText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  statusBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Progress
  progressContainer: {
    marginBottom: 20,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  // Current Item
  currentItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  currentItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  currentItemName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  currentItemQuantity: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 12,
  },
  locationContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#1F2937',
    marginTop: 2,
  },
  scanPromptContainer: {
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanPromptText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
    marginBottom: 4,
  },
  scanFeedbackBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
  },
  scanFeedbackSuccess: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  scanFeedbackError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  scanFeedbackText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  scanPromptSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  // Item List
  itemListContainer: {
    marginTop: 8,
  },
  itemListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemRowCurrent: {
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  itemRowScanned: {
    opacity: 0.6,
  },
  itemCheckbox: {
    fontSize: 20,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  itemNameScanned: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  itemDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  currentBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  // Loading
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  // Error
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  // No Order
  noOrderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    minHeight: 400,
  },
  noOrderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  noOrderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  noOrderText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  // Completed
  completedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
  },
  completedText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  // Connect Glasses
  glassesIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  glassesTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  glassesText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  connectButton: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Order Header
  orderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderShortId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  // Start Scanning Button
  startScanButton: {
    marginTop: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  startScanButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startScanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
