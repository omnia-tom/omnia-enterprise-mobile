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
import { metaWearablesService, MetaBarcode, MetaVideoFrame } from '../services/metaWearables';
import { Image } from 'react-native';

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
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    loadPickOrder();

    // Cleanup: stop stream when component unmounts
    return () => {
      if (isStreamActive) {
        metaWearablesService.stopVideoStream().catch(err =>
          console.error('[PickPackScreen] Error stopping stream on unmount:', err)
        );
      }
    };
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
    console.log('[PickPackScreen] 🎧 Setting up barcode listener...');
    console.log('[PickPackScreen] 📊 State - hasOrder:', !!pickOrder, 'hasGlasses:', hasConnectedGlasses, 'isProcessing:', isProcessingScan);

    const handleBarcodeDetected = async (barcode: MetaBarcode) => {
      console.log('[PickPackScreen] 🔔 BARCODE EVENT RECEIVED!');
      console.log('[PickPackScreen] 📦 Full barcode object:', JSON.stringify(barcode, null, 2));
      console.log('[PickPackScreen] 📊 Current state - hasOrder:', !!pickOrder, 'hasGlasses:', hasConnectedGlasses, 'isProcessing:', isProcessingScan);

      // Only process if we have a pick order and glasses are connected
      if (!pickOrder || !hasConnectedGlasses || isProcessingScan) {
        console.log('[PickPackScreen] ⚠️ Ignoring barcode - no order, no glasses, or already processing');
        console.log('[PickPackScreen] Details - pickOrder:', !!pickOrder, 'hasConnectedGlasses:', hasConnectedGlasses, 'isProcessingScan:', isProcessingScan);
        return;
      }

      // Debug: Log all items in the pick order
      console.log('[PickPackScreen] 📋 All items in pick order:');
      pickOrder.items.forEach((item, index) => {
        console.log(`  [${index}] ${item.productName} - UPC: "${item.upc}" - Scanned: ${item.scanned}`);
      });

      // Find the current item (first unscanned item)
      const currentItem = pickOrder.items.find(item => !item.scanned);
      if (!currentItem) {
        console.log('[PickPackScreen] ⚠️ No current item to scan (all items scanned?)');
        return;
      }

      console.log(`[PickPackScreen] 🏷️ Barcode detected: "${barcode.data}" (type: ${barcode.type})`);
      console.log(`[PickPackScreen] 🎯 Expected UPC: "${currentItem.upc}" for product: "${currentItem.productName}"`);
      console.log(`[PickPackScreen] 🔍 Barcode length: ${barcode.data.length}, Expected length: ${currentItem.upc.length}`);
      console.log(`[PickPackScreen] 🔍 String comparison - Match: ${barcode.data === currentItem.upc}`);

      // Check character by character if there's a mismatch
      if (barcode.data !== currentItem.upc) {
        console.log('[PickPackScreen] ❌ Mismatch detected! Character comparison:');
        console.log(`  Scanned:  "${barcode.data}"`);
        console.log(`  Expected: "${currentItem.upc}"`);
        for (let i = 0; i < Math.max(barcode.data.length, currentItem.upc.length); i++) {
          const scannedChar = barcode.data[i] || '∅';
          const expectedChar = currentItem.upc[i] || '∅';
          if (scannedChar !== expectedChar) {
            console.log(`  [${i}] "${scannedChar}" vs "${expectedChar}" ❌`);
          }
        }
      }

      setIsProcessingScan(true);

      try {
        // Handle EAN-13 vs UPC-A matching
        // If scanned code is 13 digits and expected is 12, try matching first 12 digits
        let upcToSubmit = barcode.data;

        console.log('[PickPackScreen] 🔍 Barcode matching logic:');
        console.log(`[PickPackScreen]    Scanned: "${barcode.data}" (${barcode.data.length} digits)`);
        console.log(`[PickPackScreen]    Expected: "${currentItem.upc}" (${currentItem.upc.length} digits)`);

        // Try exact match first
        if (barcode.data === currentItem.upc) {
          console.log('[PickPackScreen] ✅ Exact match!');
        }
        // If scanned is 13 and expected is 12, try first 12 digits
        else if (barcode.data.length === 13 && currentItem.upc.length === 12) {
          const first12Digits = barcode.data.substring(0, 12);
          console.log('[PickPackScreen] 🔄 EAN-13 detected, converting to UPC-A for comparison');
          console.log(`[PickPackScreen] 🔄 First 12 digits: "${first12Digits}"`);

          if (first12Digits === currentItem.upc) {
            console.log('[PickPackScreen] ✅ Match found using first 12 digits!');
            upcToSubmit = first12Digits;
          } else {
            console.log('[PickPackScreen] ❌ No match even with first 12 digits');
          }
        }
        // If scanned is 12 and expected is 13, try adding leading 0
        else if (barcode.data.length === 12 && currentItem.upc.length === 13) {
          const withLeadingZero = '0' + barcode.data;
          console.log('[PickPackScreen] 🔄 UPC-A detected, trying with leading 0 for EAN-13');
          console.log(`[PickPackScreen] 🔄 With leading 0: "${withLeadingZero}"`);

          if (withLeadingZero === currentItem.upc) {
            console.log('[PickPackScreen] ✅ Match found with leading 0!');
            // Still submit the 12-digit version
          } else {
            console.log('[PickPackScreen] ❌ No match even with leading 0');
          }
        }
        else {
          console.log('[PickPackScreen] ❌ No match - different lengths and no conversion strategy');
        }

        // Submit scan to API for validation
        console.log(`[PickPackScreen] 📡 Submitting scan - pickOrderId: ${pickOrder.id}, upc: "${upcToSubmit}"`);
        const response = await pickPackAPI.submitScan(pickOrder.id, upcToSubmit);
        console.log('[PickPackScreen] 📥 API Response:', JSON.stringify(response, null, 2));

        if (response.success) {
          // Success - provide positive feedback
          console.log('[PickPackScreen] ✅ Scan successful!');
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
          console.log('[PickPackScreen] ❌ Scan failed:', response.message);
          console.log(`[PickPackScreen] 🔍 Scanned: "${barcode.data}" vs Expected: "${currentItem.upc}"`);
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

    const handleVideoFrame = (frame: MetaVideoFrame) => {
      // Only update preview if user wants to see it
      if (showPreview) {
        setVideoFrame(frame.data);
      }
    };

    // Subscribe to barcode and video frame events
    metaWearablesService.addEventListener('barcodeDetected', handleBarcodeDetected);
    metaWearablesService.addEventListener('videoFrame', handleVideoFrame);

    // Cleanup
    return () => {
      metaWearablesService.removeEventListener('barcodeDetected', handleBarcodeDetected);
      metaWearablesService.removeEventListener('videoFrame', handleVideoFrame);
    };
  }, [pickOrder, hasConnectedGlasses, isProcessingScan, showPreview]);

  const loadPickOrder = async (): Promise<boolean> => {
    try {
      setError(null);
      const userId = auth.currentUser?.uid;

      if (!userId) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return false;
      }

      console.log('[PickPackScreen] Loading pick order for user:', userId);
      const order = await pickPackAPI.getUserActivePickOrder(userId);

      if (!order) {
        console.log('[PickPackScreen] No active pick order');
        setPickOrder(null);
        return false; // No order found
      } else {
        console.log('[PickPackScreen] Pick order loaded:', order);
        setPickOrder(order);
        return true; // Order found
      }
    } catch (error: any) {
      console.error('[PickPackScreen] Error loading pick order:', error);
      
      // Check if error is about "no active pick order" - show friendly message instead
      const errorMessage = error.message || '';
      if (errorMessage.toLowerCase().includes('no active pick order') || 
          errorMessage.toLowerCase().includes('no pick order found')) {
        // This is not really an error - just no orders available
        setPickOrder(null);
        setError(null); // Clear error state
        return false; // No order found
      } else {
        // Real error - show error message
        setError(error.message || 'Failed to load pick order');
        Alert.alert('Error', error.message || 'Failed to load pick order');
        return false;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPickOrder();
  };

  const startScanning = async () => {
    try {
      console.log('[PickPackScreen] Starting background video stream for scanning');
      await metaWearablesService.startVideoStream();
      setIsStreamActive(true);
      console.log('[PickPackScreen] Video stream started - barcode detection active');
    } catch (error: any) {
      console.error('[PickPackScreen] Failed to start video stream:', error);
      Alert.alert('Error', 'Failed to start scanning. Please ensure your glasses are connected.');
    }
  };

  const stopScanning = async () => {
    try {
      console.log('[PickPackScreen] Stopping video stream');
      await metaWearablesService.stopVideoStream();
      setIsStreamActive(false);
      console.log('[PickPackScreen] Video stream stopped');
    } catch (error: any) {
      console.error('[PickPackScreen] Failed to stop video stream:', error);
    }
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

        // Stop scanning if active
        if (isStreamActive) {
          await metaWearablesService.stopVideoStream();
          setIsStreamActive(false);
        }

        // Update local state to mark as completed
        setPickOrder({
          ...pickOrder,
          status: 'completed',
          completedAt: new Date(),
        });

        Alert.alert(
          'Order Complete! 🎉',
          `Pick order completed successfully! Great work.`,
          [{ 
            text: 'OK', 
            onPress: async () => {
              // Load new pick order after user dismisses completion alert
              const hasNewOrder = await loadPickOrder();
              
              // If no new order found, show friendly message
              if (!hasNewOrder) {
                Alert.alert(
                  'No Orders Available',
                  'You have no orders right now. Awaiting new pick session!',
                  [{ text: 'OK' }]
                );
              }
            }
          }]
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

    // Count how many items have been scanned
    const scannedCount = pickOrder.items.filter(item => item.scanned).length;
    const totalSteps = pickOrder.items.length;
    const progressPercent = (scannedCount / totalSteps) * 100;

    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Progress: {scannedCount} of {totalSteps} items picked
        </Text>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>
    );
  };

  const renderCurrentItem = () => {
    if (!pickOrder) {
      return null;
    }

    // Find the first unscanned item
    const currentItem = pickOrder.items.find(item => !item.scanned);

    // If all items are scanned, don't render current item card
    if (!currentItem) {
      return null;
    }

    return (
      <View style={styles.currentItemCard}>
        {/* Large "Find" prompt */}
        <View style={styles.findPromptContainer}>
          <Text style={styles.findLabel}>FIND:</Text>
          <Text style={styles.findItemName}>{currentItem.productName}</Text>
        </View>

        {/* Item details */}
        <View style={styles.itemDetailsRow}>
          <View style={styles.itemDetailBadge}>
            <Text style={styles.itemDetailLabel}>Qty</Text>
            <Text style={styles.itemDetailValue}>{currentItem.quantity}</Text>
          </View>
          <View style={styles.itemDetailBadge}>
            <Text style={styles.itemDetailLabel}>Aisle</Text>
            <Text style={styles.itemDetailValue}>{currentItem.location.aisle}</Text>
          </View>
          <View style={styles.itemDetailBadge}>
            <Text style={styles.itemDetailLabel}>Shelf</Text>
            <Text style={styles.itemDetailValue}>{currentItem.location.shelf}</Text>
          </View>
          <View style={styles.itemDetailBadge}>
            <Text style={styles.itemDetailLabel}>Bin</Text>
            <Text style={styles.itemDetailValue}>{currentItem.location.bin}</Text>
          </View>
        </View>

        {/* Scanning status and feedback */}
        <View style={styles.scanPromptContainer}>
          {isStreamActive && !scanFeedback && (
            <View style={styles.scanningIndicator}>
              <Text style={styles.scanningDot}>🔴</Text>
              <Text style={styles.scanningText}>Scanning active - point glasses at barcode</Text>
            </View>
          )}

          {!isStreamActive && !scanFeedback && (
            <Text style={styles.scanPromptText}>👓 Tap below to start scanning</Text>
          )}

          {scanFeedback && (
            <View style={[
              styles.scanFeedbackBanner,
              scanFeedback.type === 'success' ? styles.scanFeedbackSuccess : styles.scanFeedbackError
            ]}>
              <Text style={styles.scanFeedbackText}>{scanFeedback.message}</Text>
            </View>
          )}

          {/* Start/Stop Scanning Button */}
          <TouchableOpacity
            style={styles.startScanButton}
            onPress={isStreamActive ? stopScanning : startScanning}
          >
            <LinearGradient
              colors={isStreamActive ? ['#EF4444', '#DC2626'] : ['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.startScanButtonGradient}
            >
              <Text style={styles.startScanButtonText}>
                {isStreamActive ? '⏹ Stop Scanning' : '▶ Start Scanning'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Preview Toggle Button (only show if stream is active) */}
          {isStreamActive && (
            <TouchableOpacity
              style={styles.previewToggleButton}
              onPress={() => setShowPreview(!showPreview)}
            >
              <Text style={styles.previewToggleText}>
                {showPreview ? '📱 Hide Preview' : '👁️ Show Preview'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Video Stream Preview */}
        {showPreview && isStreamActive && videoFrame && (
          <View style={styles.videoPreviewContainer}>
            <Text style={styles.videoPreviewTitle}>Glasses View:</Text>
            <Image
              source={{ uri: `data:image/jpeg;base64,${videoFrame}` }}
              style={styles.videoPreview}
              resizeMode="contain"
            />
          </View>
        )}
      </View>
    );
  };

  const renderItemList = () => {
    if (!pickOrder) return null;

    // Find the first unscanned item to mark as current
    const currentItem = pickOrder.items.find(item => !item.scanned);

    return (
      <View style={styles.itemListContainer}>
        <Text style={styles.itemListTitle}>Pick List:</Text>
        {pickOrder.items.map((item, index) => {
          const isScanned = item.scanned;
          const isCurrent = currentItem?.productId === item.productId;

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
  // Find Prompt (large display)
  findPromptContainer: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  findLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 1,
    marginBottom: 4,
  },
  findItemName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  // Item Details Row
  itemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  itemDetailBadge: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  itemDetailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  itemDetailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  // Scanning Indicator
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
    justifyContent: 'center',
  },
  scanningDot: {
    fontSize: 12,
    marginRight: 8,
  },
  scanningText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
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
  // Preview Toggle
  previewToggleButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  previewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
  },
  // Video Preview
  videoPreviewContainer: {
    marginTop: 16,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 12,
  },
  videoPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  videoPreview: {
    width: '100%',
    height: 400,
    borderRadius: 8,
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
