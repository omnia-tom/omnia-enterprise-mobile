import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  TextInput,
  Image,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  getBleManager,
  isBleAvailable,
  getProtocolForDevice,
  GlassesProtocol,
  ConnectedArm,
  EvenRealitiesG1Protocol
} from '../services/ble';
import { storeConnectedDevices, sendMessageToGlasses } from '../services/glassesMessaging';
import { chatAPI } from '../services/chatApi';
import { ArmConnectionState, GlassesConnectionState } from '../types';
import { metaWearablesService, MetaDevice, HandPoseData } from '../services/metaWearables';

// Hand skeleton connections: pairs of joint names to draw bones between
const HAND_SKELETON_CONNECTIONS: [string, string][] = [
  // Thumb
  ['wrist', 'thumbCMC'], ['thumbCMC', 'thumbMP'], ['thumbMP', 'thumbIP'], ['thumbIP', 'thumbTip'],
  // Index finger
  ['wrist', 'indexMCP'], ['indexMCP', 'indexPIP'], ['indexPIP', 'indexDIP'], ['indexDIP', 'indexTip'],
  // Middle finger
  ['wrist', 'middleMCP'], ['middleMCP', 'middlePIP'], ['middlePIP', 'middleDIP'], ['middleDIP', 'middleTip'],
  // Ring finger
  ['wrist', 'ringMCP'], ['ringMCP', 'ringPIP'], ['ringPIP', 'ringDIP'], ['ringDIP', 'ringTip'],
  // Little finger
  ['wrist', 'littleMCP'], ['littleMCP', 'littlePIP'], ['littlePIP', 'littleDIP'], ['littleDIP', 'littleTip'],
  // Palm cross-connections
  ['indexMCP', 'middleMCP'], ['middleMCP', 'ringMCP'], ['ringMCP', 'littleMCP'],
];

const FINGERTIP_JOINTS = new Set(['thumbTip', 'indexTip', 'middleTip', 'ringTip', 'littleTip']);

const HandPoseOverlay = React.memo(({
  handPoseData,
  containerWidth,
  containerHeight,
}: {
  handPoseData: HandPoseData;
  containerWidth: number;
  containerHeight: number;
}) => {
  if (!containerWidth || !containerHeight) return null;

  const elements: React.ReactElement[] = [];
  let keyIdx = 0;

  for (const hand of handPoseData.hands) {
    const color = hand.chirality === 'left' ? '#22c55e' : hand.chirality === 'right' ? '#ef4444' : '#eab308';

    // Build joint lookup map
    const jointMap = new Map<string, { x: number; y: number; confidence: number }>();
    for (const joint of hand.joints) {
      if (joint.confidence >= 0.3) {
        jointMap.set(joint.name, joint);
      }
    }

    // Draw skeleton lines
    for (const [from, to] of HAND_SKELETON_CONNECTIONS) {
      const a = jointMap.get(from);
      const b = jointMap.get(to);
      if (!a || !b) continue;

      const x1 = a.x * containerWidth;
      const y1 = a.y * containerHeight;
      const x2 = b.x * containerWidth;
      const y2 = b.y * containerHeight;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      elements.push(
        <View
          key={`line-${keyIdx++}`}
          style={{
            position: 'absolute',
            left: x1,
            top: y1,
            width: length,
            height: 2,
            backgroundColor: color,
            opacity: 0.7,
            transformOrigin: 'left center',
            transform: [{ rotate: `${angle}deg` }],
          }}
        />
      );
    }

    // Draw joint dots
    for (const [name, joint] of jointMap) {
      const isTip = FINGERTIP_JOINTS.has(name);
      const dotSize = isTip ? 10 : 6;
      const x = joint.x * containerWidth - dotSize / 2;
      const y = joint.y * containerHeight - dotSize / 2;

      elements.push(
        <View
          key={`dot-${keyIdx++}`}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
            borderWidth: 1,
            borderColor: '#fff',
          }}
        />
      );
    }
  }

  return <>{elements}</>;
});

interface BLEConnectionScreenParams {
  deviceId: string;
  deviceName: string;
  savedBleDeviceId_left?: string;
  savedBleDeviceId_right?: string;
}

interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number;
  isConnectable: boolean | null;
  device: Device;
  estimatedDistance?: string;
}

export default function BLEConnectionScreen() {
  console.log('[BLEConnectionScreen] Component rendering...');

  const navigation = useNavigation();
  const route = useRoute();

  console.log('[BLEConnectionScreen] Route params:', route.params);

  const { deviceId, deviceName, savedBleDeviceId_left, savedBleDeviceId_right } = (route.params || {}) as BLEConnectionScreenParams;

  console.log('[BLEConnectionScreen] Parsed params:', { deviceId, deviceName, savedBleDeviceId_left, savedBleDeviceId_right });

  const bleManagerRef = useRef<BleManager | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [initialized, setInitialized] = useState(false);

  // New state for dual-arm connection
  const [protocol, setProtocol] = useState<GlassesProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<GlassesConnectionState>({
    protocolName: '',
    leftArm: null,
    rightArm: null,
    isFullyConnected: false,
  });
  const connectedArmsRef = useRef<{ left?: ConnectedArm; right?: ConnectedArm }>({});
  const connectingArmsRef = useRef<Set<string>>(new Set()); // Track devices being connected

  // Test message state
  const [testMessage, setTestMessage] = useState('Hi');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const [sequenceNumber, setSequenceNumber] = useState(1);

  // Battery state
  const [batteryStatus, setBatteryStatus] = useState<{
    caseBattery: number | null;
    leftBattery: number | null;
    rightBattery: number | null;
    glassesState: string | null;
  }>({
    caseBattery: null,
    leftBattery: null,
    rightBattery: null,
    glassesState: null,
  });

  // Mic/audio state
  // NOTE: Mic/audio functionality is NOT working as expected. We will come back to this.
  // The implementation is incomplete and needs further work on:
  // - Audio data format/deserialization
  // - Speech-to-text conversion
  // - Proper audio buffering and processing
  const [isRecording, setIsRecording] = useState(false);
  const audioBufferRef = useRef<Map<number, Uint8Array>>(new Map()); // Buffer audio by sequence number
  const recordingStartTimeRef = useRef<number | null>(null);

  // Meta Wearables state
  const [deviceType, setDeviceType] = useState<string | null>(null);
  const [isMetaWearable, setIsMetaWearable] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaStreaming, setMetaStreaming] = useState(false);
  const [metaDevices, setMetaDevices] = useState<MetaDevice[]>([]);
  const [currentVideoFrame, setCurrentVideoFrame] = useState<string | null>(null);
  const [lastBarcode, setLastBarcode] = useState<{ type: string; data: string; timestamp: number } | null>(null);

  // Hand tracking state
  const [handPoseData, setHandPoseData] = useState<HandPoseData | null>(null);
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(true);
  const [handOverlaySize, setHandOverlaySize] = useState({ width: 0, height: 0 });

  // Video recording state
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [lastRecordedVideo, setLastRecordedVideo] = useState<{ filePath: string; frameCount: number; duration: number } | null>(null);
  const [autoRecordOnStream, setAutoRecordOnStream] = useState(true); // Auto-start recording when streaming

  // Check device type from Firestore
  useEffect(() => {
    const checkDeviceType = async () => {
      try {
        const deviceDocRef = doc(db, 'devices', deviceId);
        const deviceDoc = await getDoc(deviceDocRef);

        if (deviceDoc.exists()) {
          const data = deviceDoc.data();
          const type = data.metadata?.type || 'even-realities-g1';
          setDeviceType(type);
          setIsMetaWearable(type === 'meta-wearables');

          console.log('[BLEConnectionScreen] Device type:', type);
        }
      } catch (error) {
        console.error('[BLEConnectionScreen] Error fetching device metadata:', error);
      }
    };

    checkDeviceType();
  }, [deviceId]);

  useEffect(() => {
    let mounted = true;

    const initializeBle = async () => {
      try {
        const manager = getBleManager();

        if (!manager) {
          if (mounted) {
            Alert.alert(
              'Development Build Required',
              'Bluetooth requires a development build with native modules.\n\n' +
              'Please rebuild the app:\n\n' +
              'iOS: npx expo run:ios --device\n' +
              'Android: npx expo run:android --device',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    }
                  },
                },
              ]
            );
          }
          return;
        }

        if (!mounted) return;

        bleManagerRef.current = manager;
        setInitialized(true);

        // Wait for Bluetooth to be ready before checking connected devices
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check for already connected Even devices on startup
        try {
          const connectedDevices = await manager.connectedDevices([
            '6E400001-B5A3-F393-E0A9-E50E24DCCA9E' // Nordic UART service UUID
          ]);
          const evenConnectedDevices = connectedDevices.filter(d =>
            d.name && d.name.toLowerCase().includes('even')
          );

          if (evenConnectedDevices.length > 0) {
            addLog(`📱 Found ${evenConnectedDevices.length} already connected Even device(s)!`);

            // Automatically connect to these devices
            const evenProtocol = new EvenRealitiesG1Protocol();
            setProtocol(evenProtocol);
            setConnectionState(prev => ({
              ...prev,
              protocolName: evenProtocol.name,
            }));

            for (const device of evenConnectedDevices) {
              const armSide = evenProtocol.getArmFromDeviceName(device.name || '');
              addLog(`  • ${device.name || 'Unknown'} (${armSide} arm, ID: ${device.id})`);

              if (armSide) {
                // Check if actually still connected
                const isConnected = await device.isConnected();
                addLog(`    ${armSide} connection status: ${isConnected ? 'CONNECTED ✓' : 'DISCONNECTED ✗'}`);

                if (isConnected) {
                  // Device is already connected - restore the reference directly
                  // instead of reconnecting
                  try {
                    addLog(`    ⚡ Restoring ${armSide} arm connection...`);

                    // Discover services
                    const services = await device.services();
                    const targetService = services.find(s =>
                      s.uuid.toLowerCase() === evenProtocol.serviceUUID.toLowerCase()
                    );

                    if (targetService) {
                      const characteristics = await targetService.characteristics();
                      const txChar = characteristics.find(c =>
                        c.uuid.toLowerCase() === evenProtocol.txCharacteristicUUID.toLowerCase()
                      );
                      const rxChar = characteristics.find(c =>
                        c.uuid.toLowerCase() === evenProtocol.rxCharacteristicUUID.toLowerCase()
                      );

                      // Store the connection
                      connectedArmsRef.current[armSide] = {
                        side: armSide,
                        device: device,
                        txCharacteristic: txChar || null,
                        rxCharacteristic: rxChar || null,
                      };

                      // Update UI state
                      const armState: ArmConnectionState = {
                        side: armSide,
                        connected: true,
                        deviceId: device.id,
                        deviceName: device.name || 'Unknown',
                      };

                      setConnectionState(prev => {
                        const newState = {
                          ...prev,
                          [armSide === 'left' ? 'leftArm' : 'rightArm']: armState,
                        };
                        newState.isFullyConnected =
                          evenProtocol.requiresDualArm()
                            ? (newState.leftArm?.connected && newState.rightArm?.connected) || false
                            : true;
                        return newState;
                      });

                      addLog(`    ✅ ${armSide} arm restored successfully!`);
                    }
                  } catch (error) {
                    console.error(`Error restoring ${armSide} connection:`, error);
                    addLog(`    ❌ Failed to restore ${armSide} arm`);
                  }
                } else {
                  addLog(`    ⚠️ ${armSide} arm disconnected - will need to scan`);
                }
              }
            }

            addLog('🔄 Automatically reconnecting to paired devices...');
          } else {
            addLog('💡 No paired Even devices found. Tap "Start Scan" to find devices.');
          }
        } catch (error) {
          console.error('Error checking for connected devices on startup:', error);
          addLog('💡 Tap "Start Scan" to find your glasses');
        }

        const subscription = manager.onStateChange((state) => {
          if (!mounted) return;
          setBluetoothState(state);
          if (state === State.PoweredOn) {
            // Bluetooth is ready
          } else if (state === State.PoweredOff) {
            Alert.alert('Bluetooth Off', 'Please turn on Bluetooth to connect to your glasses');
          }
        }, true);

        return () => {
          subscription.remove();
          if (bleManagerRef.current) {
            try {
              bleManagerRef.current.stopDeviceScan();
            } catch (error) {
              console.error('Error stopping scan:', error);
            }
          }
        };
      } catch (error: any) {
        console.error('Error initializing BleManager:', error);
        if (mounted) {
          const errorMessage = error?.message || 'Unknown error';

          if (errorMessage.includes('NativeModule') || errorMessage.includes('null')) {
            Alert.alert(
              'Development Build Required',
              'Bluetooth requires a development build with native modules.\n\n' +
              'The app needs to be rebuilt to include the Bluetooth native module.\n\n' +
              'Run: npx expo run:ios --device',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    }
                  },
                },
              ]
            );
          } else {
            Alert.alert(
              'Bluetooth Error',
              `Failed to initialize Bluetooth: ${errorMessage}. Please restart the app and ensure Bluetooth permissions are granted.`
            );
          }
          setInitialized(false);
        }
      }
    };

    initializeBle();

    return () => {
      mounted = false;
      // DON'T disconnect arms on unmount - keep connection alive
      // The user may navigate away and come back
      // Connections will be maintained in the background

      // Only stop scanning if we're currently scanning
      if (bleManagerRef.current) {
        try {
          bleManagerRef.current.stopDeviceScan();
        } catch (error) {
          console.error('Error stopping scan:', error);
        }
      }
    };
  }, [navigation]);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const scanPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: 'Bluetooth Scan Permission',
            message: 'App needs Bluetooth scan permission to find your glasses',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        const connectPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'Bluetooth Connect Permission',
            message: 'App needs Bluetooth connect permission to pair with your glasses',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        if (scanPermission !== PermissionsAndroid.RESULTS.GRANTED ||
            connectPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permissions Required',
            'Bluetooth permissions are required to connect to your glasses. Please enable them in app settings.'
          );
          return false;
        }
      } else {
        const fineLocationPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'App needs location permission to scan for Bluetooth devices',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        if (fineLocationPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Required',
            'Location permission is required to scan for Bluetooth devices. Please enable it in app settings.'
          );
          return false;
        }
      }
    }
    return true;
  };

  const addLog = (message: string) => {
    console.log('[BLE]', message);
    setConnectionLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const startScan = async () => {
    if (scanning || connectionState.isFullyConnected || !initialized || !bleManagerRef.current) return;

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    if (bluetoothState !== State.PoweredOn) {
      Alert.alert('Bluetooth Off', 'Please turn on Bluetooth to scan for devices');
      return;
    }

    setScanning(true);
    setScannedDevices([]); // Clear all previously scanned devices
    setConnectionLog([]);
    connectingArmsRef.current.clear(); // Clear connecting set
    addLog('Starting scan for Even devices only...');

    // Check for already connected devices AND saved device IDs
    try {
      const connectedDevices = await bleManagerRef.current.connectedDevices([]);
      const evenConnectedDevices = connectedDevices.filter(d =>
        d.name && d.name.toLowerCase().includes('even')
      );

      addLog(`Found ${evenConnectedDevices.length} connected Even device(s)`);

      // Also check if we have saved device IDs to reconnect
      if (savedBleDeviceId_left || savedBleDeviceId_right) {
        addLog(`Saved IDs: Left=${savedBleDeviceId_left || 'none'}, Right=${savedBleDeviceId_right || 'none'}`);
      }

      // Try to use already connected devices
      for (const device of evenConnectedDevices) {
        addLog(`Found connected: ${device.name} (${device.id})`);

        const scannedDevice: ScannedDevice = {
          id: device.id,
          name: device.name,
          rssi: 0,
          isConnectable: true,
          device: device,
        };

        // Add to scanned devices list
        setScannedDevices(prev => [...prev, scannedDevice]);

        // Auto-connect to use the existing connection
        const deviceProtocol = getProtocolForDevice(device.name || '');
        if (deviceProtocol instanceof EvenRealitiesG1Protocol) {
          const armSide = deviceProtocol.getArmFromDeviceName(device.name || '');
          if (armSide && !connectedArmsRef.current[armSide]) {
            addLog(`→ Auto-connecting ${armSide} arm (already paired)...`);
            connectingArmsRef.current.add(device.id);
            setTimeout(() => {
              connectToDevice(scannedDevice);
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('Error checking connected devices:', error);
      addLog('⚠️ Could not check for already connected devices');
    }

    try {
      bleManagerRef.current.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          setScanning(false);
          Alert.alert('Scan Error', error.message || 'Failed to scan for devices');
          return;
        }

        if (device) {
          const deviceName = device.name || 'Unknown Device';

          // Only process devices with "Even" in the name
          const isEvenDevice = deviceName.toLowerCase().includes('even');
          if (!isEvenDevice) {
            return; // Skip non-Even devices
          }

          setScannedDevices((prev) => {
            const existing = prev.find((d) => d.id === device.id);
            if (existing) {
              return prev.map((d) =>
                d.id === device.id
                  ? { ...d, rssi: device.rssi || 0, isConnectable: device.isConnectable }
                  : d
              );
            } else {
              // Add new Even device
              const newDevice = {
                id: device.id,
                name: deviceName,
                rssi: device.rssi || 0,
                isConnectable: device.isConnectable,
                device: device,
              };

              // Auto-connect to Even devices
              if (isEvenDevice) {
                addLog(`Discovered: "${deviceName}" (ID: ${device.id.substring(0, 8)}...)`);

                if (!connectingArmsRef.current.has(device.id)) {
                  const deviceProtocol = getProtocolForDevice(deviceName);
                  if (deviceProtocol instanceof EvenRealitiesG1Protocol) {
                    const armSide = deviceProtocol.getArmFromDeviceName(deviceName);

                    if (!armSide) {
                      addLog(`⚠️ Cannot determine arm from name: "${deviceName}"`);
                    } else if (connectedArmsRef.current[armSide]) {
                      addLog(`ℹ️ ${armSide} arm already connected, skipping`);
                    } else {
                      addLog(`→ Queuing ${armSide} arm for connection...`);
                      connectingArmsRef.current.add(device.id);
                      // Auto-connect after a short delay to allow other devices to be found
                      setTimeout(() => {
                        connectToDevice(newDevice);
                      }, 500);
                    }
                  } else {
                    addLog(`⚠️ Device protocol not recognized`);
                  }
                }
              }

              return [...prev, newDevice];
            }
          });
        }
      });
    } catch (error: any) {
      console.error('Error starting scan:', error);
      setScanning(false);
      Alert.alert('Scan Error', error.message || 'Failed to start scanning');
    }

    // Stop scanning after 20 seconds (longer to find both devices)
    setTimeout(() => {
      if (!connectionState.isFullyConnected) {
        addLog('Scan timeout. You can scan again or tap devices manually.');
      }
      stopScan();
    }, 20000);
  };

  const stopScan = () => {
    if (scanning && bleManagerRef.current) {
      try {
        bleManagerRef.current.stopDeviceScan();
      } catch (error) {
        console.error('Error stopping scan:', error);
      }
      setScanning(false);
      addLog('Scan stopped.');
    }
  };

  const calculateDistance = (rssi: number): string => {
    const txPower = -59;
    const n = 2;

    if (rssi === 0) {
      return 'Unknown';
    }

    const ratio = (txPower - rssi) / (10 * n);
    const distance = Math.pow(10, ratio);

    if (distance < 1) {
      return `${(distance * 100).toFixed(0)} cm`;
    } else if (distance < 10) {
      return `${distance.toFixed(1)} m`;
    } else {
      return `${distance.toFixed(0)} m`;
    }
  };

  // Filter to only show Even devices and sort by signal strength
  const sortedDevices = [...scannedDevices]
    .filter(device => device.name?.toLowerCase().includes('even'))
    .sort((a, b) => b.rssi - a.rssi);

  const connectToDevice = async (scannedDevice: ScannedDevice, retryCount: number = 0) => {
    const deviceProtocol = getProtocolForDevice(scannedDevice.name || '');

    if (!deviceProtocol) {
      addLog(`Unsupported device: ${scannedDevice.name}`);
      return;
    }

    // Set protocol if not already set
    if (!protocol) {
      setProtocol(deviceProtocol);
      setConnectionState(prev => ({
        ...prev,
        protocolName: deviceProtocol.name,
      }));
    }

    // Determine which arm this is
    let armSide: 'left' | 'right' | null = null;
    if (deviceProtocol instanceof EvenRealitiesG1Protocol) {
      armSide = deviceProtocol.getArmFromDeviceName(scannedDevice.name || '');
    }

    if (!armSide) {
      addLog(`Cannot determine arm for: ${scannedDevice.name}`);
      return;
    }

    // Check if already connected to this arm
    if (connectedArmsRef.current[armSide]) {
      addLog(`${armSide} arm already connected`);
      return;
    }

    setConnecting(true);
    if (retryCount > 0) {
      addLog(`Retrying ${armSide} arm connection (attempt ${retryCount + 1})...`);
    } else {
      addLog(`Connecting to ${armSide} arm...`);
    }

    try {
      const device = scannedDevice.device;

      addLog(`${armSide}: Attempting BLE connection...`);
      addLog(`${armSide}: Device ID: ${device.id}`);
      addLog(`${armSide}: Device Name: ${device.name || 'null'}`);

      // Check if device is already connected
      const isConnected = await device.isConnected();
      if (isConnected) {
        addLog(`${armSide}: Device already connected, using existing connection`);
      } else {
        addLog(`${armSide}: Connecting to device...`);
      }

      // Connect to device with options to maintain connection
      const connectedDevice = await device.connect({
        autoConnect: true, // Automatically reconnect if disconnected
        requestMTU: 512,   // Request larger MTU for better throughput
      });
      addLog(`${armSide}: BLE connected! Discovering services...`);

      // Discover services and characteristics
      addLog(`${armSide}: Discovering services...`);
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // Get the service
      const services = await connectedDevice.services();
      addLog(`${armSide}: Found ${services.length} service(s)`);

      const targetService = services.find(s => s.uuid.toLowerCase() === deviceProtocol.serviceUUID.toLowerCase());

      if (!targetService) {
        const serviceUUIDs = services.map(s => s.uuid).join(', ');
        addLog(`${armSide}: Available services: ${serviceUUIDs}`);
        throw new Error(`Service ${deviceProtocol.serviceUUID} not found. Available: ${serviceUUIDs}`);
      }

      addLog(`${armSide}: Found target service ${deviceProtocol.serviceUUID}`);

      // Get characteristics
      const characteristics = await targetService.characteristics();
      addLog(`${armSide}: Found ${characteristics.length} characteristic(s)`);

      const txChar = characteristics.find(c => c.uuid.toLowerCase() === deviceProtocol.txCharacteristicUUID.toLowerCase());
      const rxChar = characteristics.find(c => c.uuid.toLowerCase() === deviceProtocol.rxCharacteristicUUID.toLowerCase());

      if (!txChar) {
        const charUUIDs = characteristics.map(c => c.uuid).join(', ');
        addLog(`${armSide}: Available characteristics: ${charUUIDs}`);
        throw new Error(`TX characteristic not found. Available: ${charUUIDs}`);
      }

      addLog(`${armSide}: Found TX/RX characteristics`);

      // Enable notifications on RX if available
      if (rxChar) {
        rxChar.monitor((error, characteristic) => {
          if (error) {
            // Handle disconnection - update Firebase to offline
            if (error.message && error.message.includes('disconnected')) {
              console.log(`[BLE] ${armSide} arm disconnected`);
              addLog(`⚠️ ${armSide} arm disconnected`);

              // Update Firebase to offline when connection is lost
              const deviceDocRef = doc(db, 'devices', deviceId);
              updateDoc(deviceDocRef, {
                status: 'offline',
                glassesState: 'off',
                lastSeen: new Date(),
              }).catch(error => {
                console.error('Error updating status on disconnect:', error);
              });

              return;
            }

            // Ignore cancellation errors (these are normal)
            if (error.message && error.message.includes('cancel')) {
              return;
            }

            console.error('RX monitor error:', error);
            addLog(`⚠️ RX monitor error on ${armSide}: ${error.message}`);
            return;
          }

          if (characteristic?.value) {
            // Decode base64 to Uint8Array
            let uint8Data: Uint8Array;
            if (typeof Buffer !== 'undefined') {
              const data = Buffer.from(characteristic.value, 'base64');
              uint8Data = new Uint8Array(data);
            } else {
              const binary = atob(characteristic.value);
              uint8Data = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                uint8Data[i] = binary.charCodeAt(i);
              }
            }

            if (deviceProtocol.parseIncomingData) {
              const parsed = deviceProtocol.parseIncomingData(uint8Data);

              // Log ALL incoming messages for debugging (with hex)
              const hexData = Array.from(uint8Data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
              console.log(`RX from ${armSide}:`, hexData, parsed);

              // Only log if parsed data is not null (filter out empty/null messages)
              if (parsed !== null) {
                addLog(`📥 Received from ${armSide}: ${JSON.stringify(parsed)}`);

                // Update battery status and handle events
                if (parsed.type === 'case_battery' && parsed.percentage !== null) {
                  setBatteryStatus(prev => ({
                    ...prev,
                    caseBattery: parsed.percentage,
                  }));
                  addLog(`🔋 Case battery: ${parsed.percentage}%`);
                } else if (parsed.type === 'glasses_battery' && parsed.percentage !== null) {
                  // Update battery for this specific arm
                  const batteryKey = armSide === 'left' ? 'leftBattery' : 'rightBattery';
                  setBatteryStatus(prev => ({
                    ...prev,
                    [batteryKey]: parsed.percentage,
                  }));
                  addLog(`🔋 ${armSide.toUpperCase()} glasses battery: ${parsed.percentage}%`);

                  // Save to Firebase (async but don't block)
                  const deviceDocRef = doc(db, 'devices', deviceId);
                  updateDoc(deviceDocRef, {
                    [`battery_${armSide}`]: parsed.percentage,
                    lastBatteryUpdate: new Date(),
                  }).catch(error => {
                    console.error('Error saving battery to Firebase:', error);
                  });
                } else if (parsed.type === 'battery_info_response') {
                  addLog(`📊 Battery info response (0x2C):`);
                  addLog(`   Hex: ${parsed.hexString}`);

                  // Check if we have battery data
                  if (parsed.leftBattery !== undefined && parsed.rightBattery !== undefined) {
                    addLog(`   Model: ${parsed.model}`);
                    addLog(`   🔋 Left: ${parsed.leftBattery}%`);
                    addLog(`   🔋 Right: ${parsed.rightBattery}%`);

                    // Update state with BOTH batteries
                    setBatteryStatus(prev => ({
                      ...prev,
                      leftBattery: parsed.leftBattery,
                      rightBattery: parsed.rightBattery,
                    }));

                    // Save BOTH batteries to Firebase
                    const deviceDocRef = doc(db, 'devices', deviceId);
                    updateDoc(deviceDocRef, {
                      battery_left: parsed.leftBattery,
                      battery_right: parsed.rightBattery,
                      model: parsed.model,
                      lastBatteryUpdate: new Date(),
                    }).catch(error => {
                      console.error('Error saving battery to Firebase:', error);
                    });
                  } else {
                    addLog(`   ⚠️ Could not parse battery data`);
                    addLog(`   Raw: [${parsed.rawData.join(', ')}]`);
                  }
                } else if (parsed.type === 'glasses_on') {
                  console.log('[BLE-BACKGROUND] Glasses turned ON - updating Firebase');
                  setBatteryStatus(prev => ({
                    ...prev,
                    glassesState: 'on',
                  }));
                  addLog('👓 Glasses turned ON');

                  // Update Firebase status to online when glasses are put on
                  // Using console.log to track background execution
                  const deviceDocRef = doc(db, 'devices', deviceId);
                  updateDoc(deviceDocRef, {
                    status: 'online',
                    glassesState: 'on',
                    lastSeen: new Date(),
                  }).then(() => {
                    console.log('[BLE-BACKGROUND] Firebase updated: status=online');
                  }).catch(error => {
                    console.error('[BLE-BACKGROUND] Error updating status to online:', error);
                  });
                } else if (parsed.type === 'glasses_off') {
                  console.log('[BLE-BACKGROUND] Glasses turned OFF - updating Firebase');
                  setBatteryStatus(prev => ({
                    ...prev,
                    glassesState: 'off',
                  }));
                  addLog('👓 Glasses turned OFF');

                  // Update Firebase status to offline when glasses are taken off
                  // Using console.log to track background execution
                  const deviceDocRef = doc(db, 'devices', deviceId);
                  updateDoc(deviceDocRef, {
                    status: 'offline',
                    glassesState: 'off',
                    lastSeen: new Date(),
                  }).then(() => {
                    console.log('[BLE-BACKGROUND] Firebase updated: status=offline');
                  }).catch(error => {
                    console.error('[BLE-BACKGROUND] Error updating status to offline:', error);
                  });
                } else if (parsed.type === 'charging') {
                  addLog('🔌 Glasses charging');
                } else if (parsed.type === 'case_charging') {
                  addLog('🔌 Case charging');
                } else if (parsed.type === 'ack') {
                  addLog(`✓ ACK received from ${armSide} (seq: ${parsed.sequenceNumber || 'unknown'})`);
                } else if (parsed.type === 'single_tap') {
                  addLog('👆 Single tap detected - opening chat');
                  handleSingleTap();
                } else if (parsed.type === 'long_press') {
                  addLog('👆 Long press detected - activating mic and sending message');
                  handleLongPress();
                } else if (parsed.type === 'long_press_release') {
                  addLog('👆 Long press released - processing audio');
                  handleLongPressRelease();
                } else if (parsed.type === 'mic_data') {
                  addLog(`🎤 Mic data received (seq: ${parsed.sequence}, size: ${parsed.audioData.length} bytes)`);
                  handleMicData(parsed.audioData, parsed.sequence);
                } else if (parsed.type === 'mic_control_response') {
                  if (parsed.success) {
                    addLog(`✅ Mic ${parsed.enabled ? 'enabled' : 'disabled'}`);
                  } else {
                    addLog(`❌ Mic control failed (status: 0x${parsed.rspStatus.toString(16)})`);
                  }
                } else if (parsed.type === 'glasses_status') {
                  addLog(`📊 Glasses status update from ${armSide}`);

                  // Check if status contains battery info
                  if (parsed.battery !== undefined) {
                    const batteryKey = armSide === 'left' ? 'leftBattery' : 'rightBattery';
                    setBatteryStatus(prev => ({
                      ...prev,
                      [batteryKey]: parsed.battery,
                    }));
                    addLog(`🔋 ${armSide.toUpperCase()} battery from status: ${parsed.battery}%`);

                    // Save to Firebase
                    const deviceDocRef = doc(db, 'devices', deviceId);
                    updateDoc(deviceDocRef, {
                      [`battery_${armSide}`]: parsed.battery,
                      lastBatteryUpdate: new Date(),
                    }).catch(error => {
                      console.error('Error saving battery to Firebase:', error);
                    });
                  }
                }
              }
            }
          }
        });
      }

      // Monitor device connection state for disconnections
      const disconnectSub = connectedDevice.onDisconnected((error, device) => {
        console.log(`[BLE-BACKGROUND] ${armSide} arm disconnected`);
        addLog(`❌ ${armSide} arm disconnected`);

        // Update Firebase to offline when device disconnects
        const deviceDocRef = doc(db, 'devices', deviceId);
        updateDoc(deviceDocRef, {
          status: 'offline',
          glassesState: 'off',
          lastSeen: new Date(),
        }).then(() => {
          console.log('[BLE-BACKGROUND] Firebase updated on disconnect: status=offline');
        }).catch(error => {
          console.error('[BLE-BACKGROUND] Error updating status on disconnect:', error);
        });

        // Clear the connected arm reference
        delete connectedArmsRef.current[armSide];

        // Update UI state
        setConnectionState(prev => ({
          ...prev,
          [armSide === 'left' ? 'leftArm' : 'rightArm']: null,
          isFullyConnected: false,
        }));
      });

      // Send init command
      const initCommand = deviceProtocol.getInitCommand();
      let initData: string;
      if (typeof Buffer !== 'undefined') {
        initData = Buffer.from(initCommand).toString('base64');
      } else {
        const binary = Array.from(initCommand).map(byte => String.fromCharCode(byte)).join('');
        initData = btoa(binary);
      }
      await txChar.writeWithoutResponse(initData);
      addLog(`${armSide} arm: Sent init command`);

      // Store connected arm
      const connectedArm: ConnectedArm = {
        side: armSide,
        device: connectedDevice,
        txCharacteristic: txChar,
        rxCharacteristic: rxChar || null,
      };
      connectedArmsRef.current[armSide] = connectedArm;

      // Store device ID for messaging service
      if (armSide === 'left') {
        storeConnectedDevices(device.id, undefined);
      } else {
        const leftId = connectedArmsRef.current.left?.device.id;
        storeConnectedDevices(leftId, device.id);
      }

      // Update connection state
      const armState: ArmConnectionState = {
        side: armSide,
        connected: true,
        deviceId: device.id,
        deviceName: scannedDevice.name || 'Unknown',
      };

      setConnectionState(prev => {
        const newState = {
          ...prev,
          [armSide === 'left' ? 'leftArm' : 'rightArm']: armState,
        };
        newState.isFullyConnected =
          deviceProtocol.requiresDualArm()
            ? (newState.leftArm?.connected && newState.rightArm?.connected) || false
            : true;
        return newState;
      });

      setConnecting(false);
      connectingArmsRef.current.delete(device.id);

      // Check if we need both arms
      const needsBoth = deviceProtocol.requiresDualArm();
      const otherArmConnected = armSide === 'left'
        ? connectedArmsRef.current.right
        : connectedArmsRef.current.left;

      if (needsBoth && !otherArmConnected) {
        addLog(`✓ ${armSide} arm connected! Waiting for ${armSide === 'left' ? 'right' : 'left'} arm...`);

        // Only ask if we're actively scanning (not auto-connecting from paired devices)
        // Check again after a delay to see if other arm connected
        setTimeout(() => {
          const stillWaiting = armSide === 'left'
            ? !connectedArmsRef.current.right
            : !connectedArmsRef.current.left;

          if (stillWaiting && scanning) {
            // Only show dialog if still scanning
            Alert.alert(
              `${armSide === 'left' ? 'Left' : 'Right'} Arm Connected`,
              `Would you like to connect the ${armSide === 'left' ? 'right' : 'left'} arm too?\n\nYou can send messages to just one arm, or wait to connect both.`,
              [
                {
                  text: 'Use Single Arm',
                  onPress: () => {
                    addLog(`User chose to use only ${armSide} arm`);
                    stopScan();
                    // Force fully connected state for single arm usage
                    setConnectionState(prev => ({
                      ...prev,
                      isFullyConnected: true,
                    }));
                  },
                },
                {
                  text: 'Wait for Other Arm',
                  style: 'cancel',
                  onPress: () => {
                    addLog('Continuing to scan for other arm...');
                  },
                },
              ]
            );
          }
        }, 1500); // Wait longer to see if other arm connects
      } else {
        // Both arms connected!
        await saveConnectionToFirebase();
        addLog('✓✓ Both arms connected! Ready to send messages.');
        addLog('✅ Background monitoring active - status will update even when app is backgrounded');
        stopScan();

        // Auto-request battery info after connection
        setTimeout(() => {
          addLog('🔋 Auto-requesting battery info...');
          requestBatteryInfo();
        }, 1000); // Wait 1 second for connections to stabilize
      }
    } catch (error: any) {
      console.error('Connection error:', error);
      const errorMsg = error.message || error.toString();
      addLog(`❌ Error connecting ${armSide} arm: ${errorMsg}`);

      // Check if error is pairing-related
      const isPairingError = errorMsg.toLowerCase().includes('pair') ||
                             errorMsg.toLowerCase().includes('bond') ||
                             errorMsg.toLowerCase().includes('authentication') ||
                             errorMsg.toLowerCase().includes('encrypt');

      // Retry more times for pairing issues
      const maxRetries = isPairingError ? 4 : 2;

      if (retryCount < maxRetries) {
        const waitTime = isPairingError ? 3000 : 2000; // Wait longer for pairing issues
        addLog(`Will retry ${armSide} arm in ${waitTime / 1000} seconds...`);

        if (isPairingError) {
          addLog(`💡 Tip: Accept the pairing request on your device if prompted`);
        }

        setConnecting(false);

        setTimeout(() => {
          connectToDevice(scannedDevice, retryCount + 1);
        }, waitTime);
      } else {
        // Max retries reached, show error
        addLog(`❌ Failed to connect ${armSide} arm after ${retryCount + 1} attempts`);

        let errorHint = '\n\nTry scanning again or check the connection log.';
        if (isPairingError) {
          errorHint = '\n\nMake sure to accept the pairing request when prompted. You may need to go to your device\'s Bluetooth settings and remove the old pairing first.';
        }

        Alert.alert(
          'Connection Error',
          `Failed to connect to ${armSide} arm after ${retryCount + 1} attempts:\n${errorMsg}${errorHint}`,
          [{ text: 'OK' }]
        );

        setConnecting(false);
        connectingArmsRef.current.delete(scannedDevice.device.id);
      }
    }
  };

  const saveConnectionToFirebase = async () => {
    try {
      const deviceDocRef = doc(db, 'devices', deviceId);
      const updateData: any = {
        lastConnectedAt: new Date(),
        status: 'online',
      };

      // Only add protocol if it exists
      if (protocol?.name) {
        updateData.protocol = protocol.name;
      }

      // Use connectedArmsRef instead of connectionState (which may not be updated yet)
      if (connectedArmsRef.current.left) {
        updateData.bleDeviceId_left = connectedArmsRef.current.left.device.id;
        updateData.bleDeviceName_left = connectedArmsRef.current.left.device.name || 'Unknown';
      }
      if (connectedArmsRef.current.right) {
        updateData.bleDeviceId_right = connectedArmsRef.current.right.device.id;
        updateData.bleDeviceName_right = connectedArmsRef.current.right.device.name || 'Unknown';
      }

      await updateDoc(deviceDocRef, updateData);
      addLog('💾 Connection saved to Firebase');
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      addLog('❌ Failed to save connection to Firebase');
    }
  };

  const disconnectArm = async (side: 'left' | 'right') => {
    const arm = connectedArmsRef.current[side];
    if (!arm) return;

    try {
      await arm.device.cancelConnection();
      delete connectedArmsRef.current[side];

      setConnectionState(prev => ({
        ...prev,
        [side === 'left' ? 'leftArm' : 'rightArm']: null,
        isFullyConnected: false,
      }));

      Alert.alert('Disconnected', `${side === 'left' ? 'Left' : 'Right'} arm disconnected`);
    } catch (error) {
      console.error(`Error disconnecting ${side} arm:`, error);
    }
  };

  const requestBatteryInfo = async () => {
    if (!protocol) return;

    try {
      addLog('🔋 Requesting battery info from both arms...');
      const batteryCmd = protocol.getBatteryRequestCommand?.();
      if (!batteryCmd) {
        addLog('⚠️ Battery request command not available');
        return;
      }

      let batteryBase64: string;
      if (typeof Buffer !== 'undefined') {
        batteryBase64 = Buffer.from(batteryCmd).toString('base64');
      } else {
        batteryBase64 = btoa(Array.from(batteryCmd).map(b => String.fromCharCode(b)).join(''));
      }

      // Request from both arms
      let requestCount = 0;

      if (connectedArmsRef.current.left) {
        try {
          const services = await connectedArmsRef.current.left.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(batteryBase64);
              addLog('   ✅ Battery request sent to LEFT');
              requestCount++;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        } catch (error: any) {
          addLog(`   ❌ LEFT battery request failed: ${error.message}`);
        }
      }

      if (connectedArmsRef.current.right) {
        try {
          const services = await connectedArmsRef.current.right.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(batteryBase64);
              addLog('   ✅ Battery request sent to RIGHT');
              requestCount++;
            }
          }
        } catch (error: any) {
          addLog(`   ❌ RIGHT battery request failed: ${error.message}`);
        }
      }

      if (requestCount > 0) {
        addLog(`✅ Battery info requested from ${requestCount} arm(s)`);
      }
    } catch (error: any) {
      addLog(`❌ Battery request failed: ${error.message}`);
    }
  };

  const sendMinimalText = async () => {
    if (!protocol) return;

    try {
      // Use the simple clear screen command: 0x18
      const clearCmd = new Uint8Array([0x18]);

      // Convert to base64
      let clearBase64: string;
      if (typeof Buffer !== 'undefined') {
        clearBase64 = Buffer.from(clearCmd).toString('base64');
      } else {
        clearBase64 = btoa(String.fromCharCode(0x18));
      }

      // Send 0x18 clear command to both arms
      let sentCount = 0;

      if (connectedArmsRef.current.left) {
        try {
          addLog('   → Clearing LEFT arm (0x18)...');
          const services = await connectedArmsRef.current.left.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(clearBase64);
              addLog('   ✅ LEFT cleared');
              sentCount++;
              await new Promise(resolve => setTimeout(resolve, 50));
            } else {
              addLog('   ❌ LEFT: TX char not found');
            }
          } else {
            addLog('   ❌ LEFT: Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ LEFT error: ${error.message}`);
          console.error('Error sending minimal text to left:', error);
        }
      } else {
        addLog('   ⚠️ LEFT arm not connected');
      }

      if (connectedArmsRef.current.right) {
        try {
          addLog('   → Clearing RIGHT arm (0x18)...');
          const services = await connectedArmsRef.current.right.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(clearBase64);
              addLog('   ✅ RIGHT cleared');
              sentCount++;
            } else {
              addLog('   ❌ RIGHT: TX char not found');
            }
          } else {
            addLog('   ❌ RIGHT: Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ RIGHT error: ${error.message}`);
          console.error('Error sending minimal text to right:', error);
        }
      } else {
        addLog('   ⚠️ RIGHT arm not connected');
      }

      if (sentCount === 2) {
        addLog('✅ Clear sent to BOTH arms');
      } else if (sentCount === 1) {
        addLog('⚠️ Clear sent to only ONE arm - other display still shows old text!');
      } else {
        addLog('❌ Failed to clear either arm');
      }
    } catch (error: any) {
      addLog(`❌ Failed: ${error.message}`);
    }
  };

  const handleSingleTap = async () => {
    try {
      // Get device document from Firestore to check for persona
      const deviceDocRef = doc(db, 'devices', deviceId);
      const deviceDoc = await getDoc(deviceDocRef);
      
      if (!deviceDoc.exists()) {
        addLog('⚠️ Device not found in Firestore');
        Alert.alert('Error', 'Device not found. Please try again.');
        return;
      }
      
      const deviceData = deviceDoc.data();
      const personaId = deviceData.pairedPersonaId;
      
      if (!personaId) {
        addLog('⚠️ No persona assigned to device');
        Alert.alert(
          'No Persona',
          'This device does not have a persona assigned. Please assign a persona first.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      addLog(`💬 Opening chat with persona: ${personaId}`);
      
      // Navigate to Chat screen
      (navigation as any).navigate('Chat', {
        deviceId: deviceId,
        deviceName: deviceName,
        personaId: personaId,
      });
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error handling single tap:', error);
      addLog(`❌ Error opening chat: ${error.message}`);
      Alert.alert('Error', `Failed to open chat: ${error.message || 'Unknown error'}`);
    }
  };

  // NOTE: Long press mic functionality is NOT working as expected. We will come back to this.
  const handleLongPress = async () => {
    try {
      if (!protocol) {
        addLog('❌ Protocol not available');
        return;
      }

      // Get device document to check for persona
      const deviceDocRef = doc(db, 'devices', deviceId);
      const deviceDoc = await getDoc(deviceDocRef);
      
      if (!deviceDoc.exists()) {
        addLog('⚠️ Device not found in Firestore');
        return;
      }
      
      const deviceData = deviceDoc.data();
      const personaId = deviceData.pairedPersonaId;
      
      if (!personaId) {
        addLog('⚠️ No persona assigned to device');
        Alert.alert('No Persona', 'This device does not have a persona assigned.');
        return;
      }

      // Open chat screen
      addLog('💬 Opening chat...');
      (navigation as any).navigate('Chat', {
        deviceId: deviceId,
        deviceName: deviceName,
        personaId: personaId,
      });

      // Send activation message to glasses
      await sendMessageToGlasses('AI chat activated - how can I help you');
      addLog('✅ Activation message sent to glasses');

      // Clear audio buffer and start recording
      audioBufferRef.current.clear();
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
      addLog('🎤 Starting audio recording...');

      // Enable mic on both arms
      if (!protocol.getMicControlCommand) {
        addLog('❌ Protocol does not support mic control');
        return;
      }
      const micEnableCmd = protocol.getMicControlCommand(true);
      
      // Convert to base64
      let base64Data: string;
      if (typeof Buffer !== 'undefined') {
        base64Data = Buffer.from(micEnableCmd).toString('base64');
      } else {
        const binary = Array.from(micEnableCmd).map(byte => String.fromCharCode(byte)).join('');
        base64Data = btoa(binary);
      }

      let enabledCount = 0;

      // Enable mic on left arm
      if (connectedArmsRef.current.left) {
        try {
          const services = await connectedArmsRef.current.left.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              addLog('✅ Mic enabled on LEFT arm');
              enabledCount++;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        } catch (error: any) {
          addLog(`❌ Error enabling mic on LEFT: ${error.message}`);
        }
      }

      // Enable mic on right arm
      if (connectedArmsRef.current.right) {
        try {
          const services = await connectedArmsRef.current.right.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              addLog('✅ Mic enabled on RIGHT arm');
              enabledCount++;
            }
          }
        } catch (error: any) {
          addLog(`❌ Error enabling mic on RIGHT: ${error.message}`);
        }
      }

      if (enabledCount > 0) {
        addLog('🎤 Microphone enabled - listening for audio...');
      } else {
        addLog('⚠️ Failed to enable microphone on any arm');
        setIsRecording(false);
      }
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error handling long press:', error);
      addLog(`❌ Error: ${error.message}`);
      setIsRecording(false);
    }
  };

  const handleLongPressRelease = async () => {
    if (!isRecording) return;

    try {
      setIsRecording(false);
      addLog('🛑 Long press released - processing audio...');

      // Disable mic
      if (protocol && protocol.getMicControlCommand) {
        const micDisableCmd = protocol.getMicControlCommand(false);
        let base64Data: string;
        if (typeof Buffer !== 'undefined') {
          base64Data = Buffer.from(micDisableCmd).toString('base64');
        } else {
          const binary = Array.from(micDisableCmd).map(byte => String.fromCharCode(byte)).join('');
          base64Data = btoa(binary);
        }

        // Disable on both arms
        if (connectedArmsRef.current.left) {
          try {
            const services = await connectedArmsRef.current.left.device.services();
            const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
            if (targetService) {
              const characteristics = await targetService.characteristics();
              const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
              if (txChar) {
                await txChar.writeWithoutResponse(base64Data);
              }
            }
          } catch (error) {
            console.error('Error disabling mic on left:', error);
          }
        }

        if (connectedArmsRef.current.right) {
          try {
            const services = await connectedArmsRef.current.right.device.services();
            const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
            if (targetService) {
              const characteristics = await targetService.characteristics();
              const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
              if (txChar) {
                await txChar.writeWithoutResponse(base64Data);
              }
            }
          } catch (error) {
            console.error('Error disabling mic on right:', error);
          }
        }
      }

      // Process buffered audio
      await processAudioBuffer();
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error handling long press release:', error);
      addLog(`❌ Error processing audio: ${error.message}`);
    }
  };

  const processAudioBuffer = async () => {
    try {
      // Get all audio chunks sorted by sequence number
      const sequences = Array.from(audioBufferRef.current.keys()).sort((a, b) => a - b);
      
      if (sequences.length === 0) {
        addLog('⚠️ No audio data received');
        return;
      }

      addLog(`📦 Processing ${sequences.length} audio chunks...`);

      // Combine all audio chunks in sequence order
      const totalLength = sequences.reduce((sum, seq) => sum + audioBufferRef.current.get(seq)!.length, 0);
      const combinedAudio = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const seq of sequences) {
        const chunk = audioBufferRef.current.get(seq)!;
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }

      addLog(`🎵 Combined audio: ${combinedAudio.length} bytes`);

      // TODO: Convert audio to text using speech-to-text service
      // Options: Google Speech-to-Text, Azure Speech, or local transcription
      // The audio data is in combinedAudio (Uint8Array)
      // You'll need to:
      // 1. Convert Uint8Array to audio format (PCM, WAV, etc.)
      // 2. Send to speech-to-text API
      // 3. Get transcription text
      
      // Placeholder: You'll need to implement audio conversion
      // const transcription = await convertAudioToText(combinedAudio);
      
      addLog('⚠️ Audio-to-text conversion not yet implemented');
      addLog('💡 You need to integrate a speech-to-text service');
      addLog(`📊 Audio data ready: ${combinedAudio.length} bytes`);
      
      // Clear buffer
      audioBufferRef.current.clear();
      
      // Once transcription is ready, uncomment and implement:
      // if (transcription && transcription.trim()) {
      //   await sendTranscriptionToChat(transcription);
      // }
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error processing audio buffer:', error);
      addLog(`❌ Error: ${error.message}`);
    }
  };

  const handleMicData = (audioData: Uint8Array, sequence: number) => {
    if (!isRecording) {
      // Ignore mic data if not recording
      return;
    }

    // Buffer audio data by sequence number
    // Note: Audio data comes as raw bytes - you may need to deserialize based on format
    // The glasses send audio data in the format: 0xF1 {seq} {audio_data}
    audioBufferRef.current.set(sequence, new Uint8Array(audioData));
    console.log(`[BLEConnectionScreen] Buffered audio chunk: seq=${sequence}, size=${audioData.length}, total chunks=${audioBufferRef.current.size}`);
  };

  // Meta Wearables initialization and connection
  useEffect(() => {
    if (!isMetaWearable || !metaWearablesService.isSDKAvailable()) return;

    let autoConnectAttempted = false;

    const initMeta = async () => {
      try {
        console.log('[BLEConnectionScreen] Initializing Meta Wearables SDK...');
        await metaWearablesService.initializeSDK();
        addLog('✅ Meta Wearables SDK initialized');

        // Set up event listeners
        metaWearablesService.addEventListener('deviceFound', (device: MetaDevice) => {
          console.log('[BLEConnectionScreen] Meta device found:', device);
          addLog(`📱 Found Meta device: ${device.name}`);

          setMetaDevices(prev => {
            const exists = prev.find(d => d.id === device.id);
            if (exists) return prev;

            // Auto-connect to first device found (like Camera Access sample)
            if (!autoConnectAttempted && prev.length === 0) {
              autoConnectAttempted = true;
              addLog(`🔗 Auto-connecting to ${device.name}...`);
              setTimeout(() => connectToMetaDevice(device), 500);
            }

            return [...prev, device];
          });
        });

        metaWearablesService.addEventListener('deviceConnected', (device: MetaDevice) => {
          console.log('[BLEConnectionScreen] Meta device connected:', device);
          addLog(`✅ Connected to ${device.name}`);
          setMetaConnected(true);
          // Note: Status is NOT set to online here - only when streaming starts
          // The SDK 'connected' event reflects registration, not actual Bluetooth connectivity
        });

        metaWearablesService.addEventListener('deviceDisconnected', () => {
          console.log('[BLEConnectionScreen] Meta device disconnected');
          addLog(`❌ Device disconnected`);
          setMetaConnected(false);

          // Update Firestore status to offline (matching Even Realities format)
          try {
            const deviceDocRef = doc(db, 'devices', deviceId);
            updateDoc(deviceDocRef, {
              status: 'offline',
              glassesState: 'off',
              lastSeen: new Date(),
              lastDisconnectedAt: new Date(),
            }).then(() => {
              console.log('[BLEConnectionScreen] ✅ Firebase updated on Meta disconnect: status=offline');
            }).catch(err => {
              console.error('[BLEConnectionScreen] ❌ Error updating status on Meta disconnect:', err);
            });
          } catch (error) {
            console.error('[BLEConnectionScreen] ❌ Error updating device status:', error);
          }
        });

        metaWearablesService.addEventListener('videoFrame', (frame: any) => {
          // Update video frame for display
          setCurrentVideoFrame(frame.data);
        });

        metaWearablesService.addEventListener('barcodeDetected', (barcode: any) => {
          console.log('[BLEConnectionScreen] Barcode detected:', barcode);
          addLog(`🏷️ ${barcode.type} detected: ${barcode.data} (confidence: ${(barcode.confidence * 100).toFixed(1)}%)`);

          // Update state with last detected barcode
          setLastBarcode({
            type: barcode.type,
            data: barcode.data,
            timestamp: barcode.timestamp
          });

          // TODO: Handle barcode detection (e.g., lookup product, show info, etc.)
          // You can add custom logic here to handle detected barcodes
        });

        metaWearablesService.addEventListener('handPoseDetected', (data: HandPoseData) => {
          setHandPoseData(data);
        });

        metaWearablesService.addEventListener('error', (error: any) => {
          console.error('[BLEConnectionScreen] Meta error:', error);
          addLog(`❌ Error: ${error.message}`);
        });

        // Auto-start discovery (like Camera Access sample)
        addLog('🔍 Auto-discovering Meta devices...');
        try {
          await metaWearablesService.startPairing('');
          addLog('✅ Discovery started - looking for paired glasses...');
        } catch (error: any) {
          if (error.message?.includes('NOT_REGISTERED')) {
            addLog('⚠️ Not registered yet - tap "Register & Connect" to approve in Meta AI');
          } else {
            addLog(`❌ Discovery error: ${error.message}`);
          }
        }

      } catch (error: any) {
        console.error('[BLEConnectionScreen] Failed to initialize Meta SDK:', error);
        addLog(`❌ Failed to initialize Meta SDK: ${error.message}`);
      }
    };

    initMeta();

    return () => {
      metaWearablesService.removeAllListeners();
    };
  }, [isMetaWearable]);

  // AppState monitoring for Meta devices - check status when app comes to foreground
  useEffect(() => {
    if (!isMetaWearable) return;

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[BLEConnectionScreen] App came to foreground, checking Meta streaming status');

        // If not streaming, ensure status is offline
        if (!metaStreaming) {
          try {
            const deviceDocRef = doc(db, 'devices', deviceId);
            await updateDoc(deviceDocRef, {
              status: 'offline',
            });
            console.log('[BLEConnectionScreen] Set status to offline (not streaming)');
          } catch (error) {
            console.warn('[BLEConnectionScreen] Could not update status on foreground:', error);
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isMetaWearable, metaStreaming, deviceId]);

  const startMetaConnection = async () => {
    try {
      addLog('🔄 Starting Meta Wearables connection...');

      // Start pairing/registration - this will redirect to Meta AI if needed
      await metaWearablesService.startPairing('');
      addLog('✅ Registration initiated - devices will appear when ready');

    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error starting Meta connection:', error);
      addLog(`❌ Connection error: ${error.message}`);
      Alert.alert('Connection Error', error.message);
    }
  };

  const connectToMetaDevice = async (device: MetaDevice) => {
    try {
      addLog(`🔗 Connecting to ${device.name}...`);
      await metaWearablesService.connectToDevice(device.id);
      setMetaConnected(true);
      addLog(`✅ Connected to ${device.name}`);

      // Update Firebase with device info (but NOT status - that's set when streaming starts)
      try {
        const deviceDocRef = doc(db, 'devices', deviceId);
        await updateDoc(deviceDocRef, {
          lastConnectedAt: new Date(),
          metaDeviceId: device.id,
          metaDeviceName: device.name,
        });
        addLog('✅ Device info updated in Firebase');
      } catch (dbError: any) {
        // Log but don't fail the connection if Firestore update fails
        console.warn('[BLEConnectionScreen] Failed to update Firestore:', dbError);
        addLog(`⚠️ Note: Could not update device info in database`);
      }

    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error connecting to Meta device:', error);
      addLog(`❌ Connection failed: ${error.message}`);
      Alert.alert('Connection Error', error.message);
    }
  };

  const startMetaStreaming = async () => {
    try {
      addLog('📹 Starting video stream...');
      setMetaStreaming(true);
      await metaWearablesService.startVideoStream();
      addLog('✅ Video streaming started');

      // Auto-start recording if enabled
      if (autoRecordOnStream) {
        // Small delay to ensure stream is fully initialized
        setTimeout(() => {
          startVideoRecording();
        }, 1000);
      }

      // Set status to online when streaming starts (actual connectivity confirmed)
      try {
        const deviceDocRef = doc(db, 'devices', deviceId);
        await updateDoc(deviceDocRef, {
          status: 'online',
          lastStreamStarted: new Date(),
        });
        console.log('[BLEConnectionScreen] Status set to online (streaming active)');
      } catch (dbError) {
        console.warn('[BLEConnectionScreen] Could not update status to online:', dbError);
      }
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error starting stream:', error);
      addLog(`❌ Streaming error: ${error.message}`);
      setMetaStreaming(false);
      Alert.alert('Streaming Error', error.message);
    }
  };

  const stopMetaStreaming = async () => {
    try {
      console.log('[BLE] stopMetaStreaming called, isVideoRecording:', isVideoRecording);

      // Auto-stop recording if active
      if (isVideoRecording) {
        console.log('[BLE] Stopping video recording before stopping stream...');
        await stopVideoRecording();
      } else {
        console.log('[BLE] No video recording active to stop');
      }

      addLog('⏹️ Stopping video stream...');
      await metaWearablesService.stopVideoStream();
      setMetaStreaming(false);
      setCurrentVideoFrame(null);
      addLog('✅ Video streaming stopped');

      // Set status to offline when streaming stops
      try {
        const deviceDocRef = doc(db, 'devices', deviceId);
        await updateDoc(deviceDocRef, {
          status: 'offline',
          lastStreamStopped: new Date(),
        });
        console.log('[BLEConnectionScreen] Status set to offline (streaming stopped)');
      } catch (dbError) {
        console.warn('[BLEConnectionScreen] Could not update status to offline:', dbError);
      }
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error stopping stream:', error);
      addLog(`❌ Error stopping stream: ${error.message}`);
    }
  };

  const startVideoRecording = async () => {
    try {
      addLog('🔴 Starting video recording...');
      await metaWearablesService.startRecording();
      setIsVideoRecording(true);
      addLog('✅ Video recording started');
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error starting recording:', error);
      addLog(`❌ Recording error: ${error.message}`);
      Alert.alert('Recording Error', error.message);
    }
  };

  const stopVideoRecording = async () => {
    try {
      console.log('[BLE] stopVideoRecording called');
      addLog('⏹️ Stopping video recording...');
      console.log('[BLE] Calling metaWearablesService.stopRecording()...');
      const result = await metaWearablesService.stopRecording();
      console.log('[BLE] Recording stopped, result:', result);
      setIsVideoRecording(false);
      setLastRecordedVideo(result);
      addLog(`✅ Video saved: ${result.frameCount} frames, ${result.duration.toFixed(1)}s`);
      addLog(`📁 File path: ${result.filePath}`);

      Alert.alert(
        'Video Saved',
        `Recording saved successfully!\n\n` +
        `Frames: ${result.frameCount}\n` +
        `Duration: ${result.duration.toFixed(1)}s\n\n` +
        `Path: ${result.filePath}`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error stopping recording:', error);
      addLog(`❌ Error saving video: ${error.message}`);
      setIsVideoRecording(false);
      Alert.alert('Recording Error', error.message);
    }
  };

  const sendTranscriptionToChat = async (transcription: string) => {
    try {
      // Get device document to get personaId
      const deviceDocRef = doc(db, 'devices', deviceId);
      const deviceDoc = await getDoc(deviceDocRef);
      
      if (!deviceDoc.exists()) {
        addLog('⚠️ Device not found');
        return;
      }
      
      const deviceData = deviceDoc.data();
      const personaId = deviceData.pairedPersonaId;
      
      if (!personaId) {
        addLog('⚠️ No persona assigned');
        return;
      }

      addLog(`💬 Sending transcription to chat: "${transcription.substring(0, 50)}..."`);

      // Send to chat API
      const response = await chatAPI.sendMessage(personaId, transcription);
      
      addLog(`✅ Received response from AI`);

      // Send response to glasses
      await sendMessageToGlasses(response.answer);
      addLog('✅ Response sent to glasses display');
    } catch (error: any) {
      console.error('[BLEConnectionScreen] Error sending transcription to chat:', error);
      addLog(`❌ Error: ${error.message}`);
    }
  };

  const clearDisplays = async () => {
    if (!protocol) return;

    try {
      addLog('⏳ Clearing displays with 0x18 command...');

      // Use the simple clear screen command: 0x18
      const clearCmd = new Uint8Array([0x18]);
      let clearBase64: string;
      if (typeof Buffer !== 'undefined') {
        clearBase64 = Buffer.from(clearCmd).toString('base64');
      } else {
        clearBase64 = btoa(String.fromCharCode(0x18));
      }

      let clearedCount = 0;

      // Clear LEFT ARM
      if (connectedArmsRef.current.left) {
        try {
          const services = await connectedArmsRef.current.left.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(clearBase64);
              addLog('   ✅ LEFT cleared');
              clearedCount++;
              await new Promise(resolve => setTimeout(resolve, 50));
            } else {
              addLog('   ❌ LEFT: TX char not found');
            }
          } else {
            addLog('   ❌ LEFT: Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ LEFT error: ${error.message}`);
        }
      } else {
        addLog('   ⚠️ LEFT arm not connected');
      }

      // Clear RIGHT ARM
      addLog('   → Clearing RIGHT arm...');
      if (connectedArmsRef.current.right) {
        try {
          const services = await connectedArmsRef.current.right.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            if (txChar) {
              await txChar.writeWithoutResponse(clearBase64);
              addLog('   ✅ RIGHT cleared');
              clearedCount++;
            } else {
              addLog('   ❌ RIGHT: TX char not found');
            }
          } else {
            addLog('   ❌ RIGHT: Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ RIGHT error: ${error.message}`);
        }
      } else {
        addLog('   ⚠️ RIGHT arm not connected');
      }

      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      if (clearedCount === 2) {
        addLog(`✅ Clear sent to BOTH arms successfully`);
      } else if (clearedCount === 1) {
        addLog(`⚠️ Clear sent to only ONE arm - this is why you still see text!`);
      } else {
        addLog(`❌ Failed to clear either arm`);
      }
    } catch (error: any) {
      addLog(`❌ Clear failed: ${error.message}`);
    }
  };

  const sendTestMessage = async () => {
    if (!protocol || !testMessage.trim() || sendingMessage) return;

    // Allow sending to just one arm for testing
    if (!connectionState.leftArm?.connected && !connectionState.rightArm?.connected) {
      Alert.alert(
        'Not Connected',
        'Please connect to at least one arm before sending messages.'
      );
      return;
    }

    // Check glasses state
    if (batteryStatus.glassesState === 'off') {
      addLog('⚠️ WARNING: Glasses appear to be OFF. Turn them on to see the display.');
    }

    setSendingMessage(true);
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    addLog(`📤 Sending to BOTH ARMS`);
    addLog(`📤 Message: "${testMessage}"`);
    if (batteryStatus.caseBattery !== null) {
      addLog(`🔋 Case battery: ${batteryStatus.caseBattery}%`);
    }
    if (batteryStatus.glassesState) {
      addLog(`👓 Glasses state: ${batteryStatus.glassesState.toUpperCase()}`);
    }

    try {
      // Use sequence number 200 for main content display (like DisplayPlus does)
      // DisplayPlus uses: 123 for alerts, 200 for device summary, 201 for clear
      const currentSeq = 200;

      // Use 0x71 flag (standard text display mode)
      const messageData = protocol.createTextMessage(testMessage.trim(), currentSeq, false);

      // Log the complete raw message data for debugging
      const hexString = Array.from(messageData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
      addLog(`📤 Full message packet (${messageData.length} bytes):`);
      addLog(`   ${hexString.substring(0, 100)}${hexString.length > 100 ? '...' : ''}`);

      // Decode the header for verification
      addLog(`📋 Message header breakdown:`);
      addLog(`   Command: 0x${messageData[0].toString(16)} (should be 0x4e)`);
      addLog(`   Sequence: ${messageData[1]} (200 = device summary/main content)`);
      addLog(`   Total packages: ${messageData[2]}`);
      addLog(`   Current package: ${messageData[3]}`);
      addLog(`   Display flags: 0x${messageData[4].toString(16)} (0x71 = new content + text show)`);
      addLog(`   Text: "${testMessage.trim()}"`);

      // Convert Uint8Array to base64
      let base64Data: string;
      if (typeof Buffer !== 'undefined') {
        base64Data = Buffer.from(messageData).toString('base64');
      } else {
        // Fallback for environments without Buffer
        const binary = Array.from(messageData).map(byte => String.fromCharCode(byte)).join('');
        base64Data = btoa(binary);
      }

      // Send to BOTH arms sequentially
      let sentCount = 0;

      // LEFT ARM FIRST
      if (connectedArmsRef.current.left) {
        const leftArm = connectedArmsRef.current.left;
        addLog('▶️ LEFT ARM (left side of glasses):');
        addLog(`   Message: "${testMessage.trim()}"`);

        try {
          const services = await leftArm.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());

          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());

            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              addLog('   ✅ LEFT display updated');
              sentCount++;
              // Small delay before right arm
              await new Promise(resolve => setTimeout(resolve, 50));
            } else {
              addLog('   ❌ TX characteristic not found');
            }
          } else {
            addLog('   ❌ Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ Error: ${error.message}`);
        }
      } else {
        addLog('⚠️ LEFT ARM: Not connected');
      }

      // RIGHT ARM SECOND
      if (connectedArmsRef.current.right) {
        const rightArm = connectedArmsRef.current.right;
        addLog('▶️ RIGHT ARM (right side of glasses):');
        addLog(`   Message: "${testMessage.trim()}"`);

        try {
          const services = await rightArm.device.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());

          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());

            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              addLog('   ✅ RIGHT display updated');
              sentCount++;
            } else {
              addLog('   ❌ TX characteristic not found');
            }
          } else {
            addLog('   ❌ Service not found');
          }
        } catch (error: any) {
          addLog(`   ❌ Error: ${error.message}`);
        }
      } else {
        addLog('⚠️ RIGHT ARM: Not connected');
      }

      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      if (sentCount === 2) {
        addLog(`✅ Message sent to BOTH arms!`);
        addLog(`   Message will clear in 5 seconds...`);
      } else if (sentCount === 1) {
        addLog(`⚠️ Message sent to only ONE arm`);
      } else {
        addLog(`❌ Failed to send message`);
        Alert.alert('Error', 'Failed to send message. Check connection log.');
      }

      // Auto-clear after 5 seconds
      // Note: Text messages can't truly be "cleared" - they persist until replaced
      // So we'll just send a minimal dot which appears nearly blank
      if (sentCount > 0) {
        setTimeout(() => {
          addLog('⏰ 5 seconds elapsed, sending minimal text...');
          sendMinimalText();
        }, 5000);
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      addLog(`Error: ${error.message}`);
      Alert.alert('Send Failed', error.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  // Render Meta Wearables UI if it's a Meta device
  if (isMetaWearable) {
    // Fullscreen streaming mode
    if (metaStreaming && currentVideoFrame) {
      return (
        <View style={styles.fullscreenContainer}>
          <StatusBar style="light" />

          {/* Fullscreen Video */}
          <Image
            source={{ uri: `data:image/jpeg;base64,${currentVideoFrame}` }}
            style={styles.fullscreenVideo}
            resizeMode="cover"
          />

          {/* Hand Pose Overlay */}
          {handTrackingEnabled && handPoseData && (
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setHandOverlaySize({ width, height });
              }}
            >
              <HandPoseOverlay
                handPoseData={handPoseData}
                containerWidth={handOverlaySize.width}
                containerHeight={handOverlaySize.height}
              />
            </View>
          )}

          {/* Barcode Detection Overlay */}
          {lastBarcode && (
            <View style={styles.barcodeOverlay}>
              <LinearGradient
                colors={['rgba(16, 185, 129, 0.95)', 'rgba(5, 150, 105, 0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.barcodeCard}
              >
                <Text style={styles.barcodeType}>🏷️ {lastBarcode.type}</Text>
                <Text style={styles.barcodeData}>{lastBarcode.data}</Text>
                <TouchableOpacity
                  onPress={() => setLastBarcode(null)}
                  style={styles.barcodeDismiss}
                >
                  <Text style={styles.barcodeDismissText}>✕ Dismiss</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          )}

          {/* Floating Controls */}
          <View style={styles.floatingControls}>
            {/* Recording status indicator */}
            {isVideoRecording && (
              <View style={{ marginBottom: 12, backgroundColor: 'rgba(239, 68, 68, 0.9)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 2 }}>🔴 Recording</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 11, opacity: 0.9 }}>📹 Video + 🎤 Audio</Text>
              </View>
            )}

            {/* Recording toggle button */}
            <TouchableOpacity
              onPress={isVideoRecording ? stopVideoRecording : startVideoRecording}
              style={[styles.floatingButton, { marginBottom: 12 }]}
            >
              <LinearGradient
                colors={isVideoRecording ? ['rgba(239, 68, 68, 0.9)', 'rgba(220, 38, 38, 0.9)'] : ['rgba(16, 185, 129, 0.9)', 'rgba(5, 150, 105, 0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.floatingButtonGradient}
              >
                <Text style={styles.floatingButtonText}>
                  {isVideoRecording ? '⏹ Stop Recording' : '🔴 Start Recording'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Hand tracking toggle button */}
            <TouchableOpacity
              onPress={() => {
                const newEnabled = !handTrackingEnabled;
                setHandTrackingEnabled(newEnabled);
                if (!newEnabled) setHandPoseData(null);
                metaWearablesService.setHandPoseEnabled(newEnabled).catch(() => {});
              }}
              style={[styles.floatingButton, { marginBottom: 12 }]}
            >
              <LinearGradient
                colors={handTrackingEnabled ? ['rgba(139, 92, 246, 0.9)', 'rgba(109, 40, 217, 0.9)'] : ['rgba(107, 114, 128, 0.9)', 'rgba(75, 85, 99, 0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.floatingButtonGradient}
              >
                <Text style={styles.floatingButtonText}>
                  {handTrackingEnabled ? 'Hands: ON' : 'Hands: OFF'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Stop streaming button */}
            <TouchableOpacity
              onPress={stopMetaStreaming}
              style={styles.floatingButton}
            >
              <LinearGradient
                colors={['rgba(107, 114, 128, 0.9)', 'rgba(75, 85, 99, 0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.floatingButtonGradient}
              >
                <Text style={styles.floatingButtonText}>⏹ Stop Streaming</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Back Button */}
          <TouchableOpacity
            onPress={() => {
              stopMetaStreaming();
              navigation.goBack();
            }}
            style={styles.floatingBackButton}
          >
            <Text style={styles.floatingBackButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Normal connection UI
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
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meta Wearables</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Connection Status */}
          <View style={styles.statusCard}>
            <Text style={styles.statusCardTitle}>Meta Ray-Ban Glasses</Text>

            <View style={[styles.armCard, metaConnected && styles.armCardConnected]}>
              <Text style={styles.armLabel}>Connection Status</Text>
              {metaConnected ? (
                <View style={styles.connectedIndicator}>
                  <View style={styles.connectedDot} />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              ) : (
                <Text style={styles.armNotConnected}>Not Connected</Text>
              )}
            </View>

            {/* Manual Connection Button - only show if auto-discovery failed */}
            {!metaConnected && metaDevices.length === 0 && (
              <View style={{marginTop: 12}}>
                <Text style={styles.infoText}>
                  Looking for glasses paired in Meta View app...
                </Text>
                <TouchableOpacity onPress={startMetaConnection} style={[styles.scanButton, {marginTop: 12}]}>
                  <LinearGradient
                    colors={['#6366F1', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.scanButtonGradient}
                  >
                    <Text style={styles.scanButtonText}>Register & Connect</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Device List */}
            {metaDevices.length > 0 && !metaConnected && (
              <View style={{marginTop: 16}}>
                <Text style={styles.devicesTitle}>Available Devices</Text>
                {metaDevices.map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    onPress={() => connectToMetaDevice(device)}
                    style={styles.deviceCard}
                  >
                    <View style={styles.deviceCardContent}>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceCardName}>{device.name}</Text>
                        <Text style={styles.deviceCardId}>ID: {device.id.substring(0, 16)}...</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Streaming Controls */}
            {metaConnected && (
              <View style={styles.testMessageSection}>
                <Text style={styles.testMessageLabel}>Camera Access</Text>
                <Text style={[styles.infoText, {marginBottom: 16}]}>
                  Stream live video from your glasses
                </Text>

                {!metaStreaming && (
                  <View>
                    {/* Auto-record toggle */}
                    <TouchableOpacity
                      onPress={() => setAutoRecordOnStream(!autoRecordOnStream)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: autoRecordOnStream ? '#F0FDF4' : '#F3F4F6',
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 16,
                        borderWidth: 1,
                        borderColor: autoRecordOnStream ? '#10B981' : '#D1D5DB',
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          backgroundColor: autoRecordOnStream ? '#10B981' : '#9CA3AF',
                          marginRight: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {autoRecordOnStream && <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 }}>
                          Auto-start recording
                        </Text>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>
                          Automatically record video + audio when streaming starts
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={startMetaStreaming} style={styles.sendTestButton}>
                      <LinearGradient
                        colors={['#6366F1', '#8B5CF6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.sendTestButtonGradient}
                      >
                        <Text style={styles.sendTestButtonText}>📹 Start Streaming</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                {metaStreaming && (
                  <View>
                    <View style={{ backgroundColor: '#EDE9FE', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                      <Text style={[styles.infoText, { color: '#6366F1', textAlign: 'center' }]}>
                        📹 Streaming active - video preview is fullscreen
                      </Text>
                    </View>

                    {lastRecordedVideo && (
                      <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                        <Text style={[styles.infoText, { color: '#059669', fontWeight: '600', marginBottom: 4 }]}>
                          ✅ Last recording saved to Photos
                        </Text>
                        <Text style={[styles.infoText, { fontSize: 12 }]}>
                          {lastRecordedVideo.frameCount} frames • {lastRecordedVideo.duration.toFixed(1)}s
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Render BLE UI for Even Realities G1
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
            stopScan();
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
        <Text style={styles.title}>Connect to {deviceName}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Connection Status */}
        {protocol && (
          <View style={styles.statusCard}>
            <Text style={styles.statusCardTitle}>
              {protocol.name}
            </Text>

            <View style={styles.armsContainer}>
              {/* Left Arm */}
              <View style={[
                styles.armCard,
                connectionState.leftArm?.connected && styles.armCardConnected
              ]}>
                <Text style={styles.armLabel}>Left Arm</Text>
                {connectionState.leftArm?.connected ? (
                  <>
                    <View style={styles.connectedIndicator}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedText}>Connected</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.armNotConnected}>Not Connected</Text>
                )}
              </View>

              {/* Right Arm */}
              <View style={[
                styles.armCard,
                connectionState.rightArm?.connected && styles.armCardConnected
              ]}>
                <Text style={styles.armLabel}>Right Arm</Text>
                {connectionState.rightArm?.connected ? (
                  <>
                    <View style={styles.connectedIndicator}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedText}>Connected</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.armNotConnected}>Not Connected</Text>
                )}
              </View>
            </View>

            {/* Debug Info */}
            <View style={styles.debugSection}>
              {/* Only show BLE connection info if glasses are not offline */}
              {batteryStatus.glassesState !== 'off' && (
                <>
                  <Text style={styles.debugText}>
                    Left: {connectionState.leftArm?.connected ? '✓' : '✗'} |
                    Right: {connectionState.rightArm?.connected ? '✓' : '✗'} |
                    Fully: {connectionState.isFullyConnected ? '✓' : '✗'}
                  </Text>
                  {connectionState.isFullyConnected && (
                    <Text style={[styles.debugText, { color: '#10B981', marginTop: 4 }]}>
                      🎉 Both arms connected! Scroll down for test message button.
                    </Text>
                  )}
                  {/* Battery & Status Info */}
                  {(batteryStatus.caseBattery !== null || batteryStatus.glassesState) && (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(99, 102, 241, 0.2)' }}>
                      {batteryStatus.caseBattery !== null && (
                        <Text style={[styles.debugText, { color: '#6366F1' }]}>
                          🔋 Case Battery: {batteryStatus.caseBattery}%
                        </Text>
                      )}
                      {batteryStatus.glassesState && (
                        <Text style={[styles.debugText, {
                          color: batteryStatus.glassesState === 'on' ? '#10B981' : '#EF4444',
                          marginTop: 4
                        }]}>
                          👓 Glasses: {batteryStatus.glassesState.toUpperCase()}
                        </Text>
                      )}
                    </View>
                  )}
                </>
              )}
              {/* Show offline status message when glasses are off */}
              {batteryStatus.glassesState === 'off' && (
                <Text style={[styles.debugText, { color: '#EF4444' }]}>
                  👓 Status: OFFLINE (Turn on glasses to connect)
                </Text>
              )}
            </View>

            {/* Test Message Section - Always show if protocol is set */}
            {protocol && connectionState.isFullyConnected && (
              <View style={styles.testMessageSection}>
                <Text style={styles.testMessageLabel}>Send Test Message</Text>

                {/* Show which arms will receive the message */}
                <View style={styles.targetArmsIndicator}>
                  <Text style={styles.targetArmsLabel}>Will send to: </Text>
                  {connectionState.leftArm?.connected && (
                    <View style={styles.targetArmBadge}>
                      <Text style={styles.targetArmText}>Left</Text>
                    </View>
                  )}
                  {connectionState.rightArm?.connected && (
                    <View style={styles.targetArmBadge}>
                      <Text style={styles.targetArmText}>Right</Text>
                    </View>
                  )}
                </View>

                <TextInput
                  style={styles.testMessageInput}
                  value={testMessage}
                  onChangeText={setTestMessage}
                  placeholder="Enter message..."
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  onPress={sendTestMessage}
                  disabled={sendingMessage || !testMessage.trim()}
                  style={styles.sendTestButton}
                >
                  <LinearGradient
                    colors={['#6366F1', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.sendTestButtonGradient,
                      (sendingMessage || !testMessage.trim()) && styles.sendTestButtonDisabled
                    ]}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.sendTestButtonText}>Send to Glasses</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Clear Display Button */}
                <TouchableOpacity
                  onPress={clearDisplays}
                  style={[styles.sendTestButton, { marginTop: 12 }]}
                >
                  <View style={[styles.sendTestButtonGradient, { backgroundColor: '#EF4444' }]}>
                    <Text style={styles.sendTestButtonText}>Clear Displays</Text>
                  </View>
                </TouchableOpacity>

              </View>
            )}

            {/* Show message even if not fully connected - for debugging */}
            {!connectionState.isFullyConnected && (connectionState.leftArm?.connected || connectionState.rightArm?.connected) && (
              <View style={styles.debugSection}>
                <Text style={styles.debugText}>
                  Waiting for both arms to connect...
                </Text>
              </View>
            )}

            {/* Connection Log */}
            {connectionLog.length > 0 && (
              <View style={styles.logSection}>
                <Text style={styles.logTitle}>Connection Log:</Text>
                <ScrollView style={styles.logScroll} nestedScrollEnabled>
                  {connectionLog.map((log, index) => (
                    <Text key={index} style={styles.logText}>{log}</Text>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {!initialized && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Initializing Bluetooth...</Text>
          </View>
        )}

        {initialized && !connectionState.isFullyConnected && (
          <>
            <Text style={styles.instructions}>
              {scanning
                ? 'Scanning and auto-connecting to Even devices...'
                : 'Tap "Start Scan" to find and connect to your Even Realities G1 glasses'}
            </Text>

            {!scanning && !connecting && (
              <TouchableOpacity onPress={startScan} style={styles.scanButton}>
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.scanButtonGradient}
                >
                  <Text style={styles.scanButtonText}>
                    {scannedDevices.length > 0 ? 'Scan Again' : 'Start Scan'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {(scanning || connecting) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>
                  {scanning ? 'Scanning for devices...' : 'Connecting...'}
                </Text>
              </View>
            )}

            {scanning && (
              <TouchableOpacity onPress={stopScan} style={styles.stopButton}>
                <Text style={styles.stopButtonText}>Stop Scan</Text>
              </TouchableOpacity>
            )}

            {scannedDevices.length > 0 && (
              <>
                <Text style={styles.devicesTitle}>
                  Found Devices ({scannedDevices.length})
                </Text>
                <Text style={styles.devicesSubtitle}>
                  Tap a device to manually connect
                </Text>
                {sortedDevices.map((device) => {
                  const hasEven = device.name?.toLowerCase().includes('even') || false;
                  const distance = calculateDistance(device.rssi);
                  const deviceProtocol = hasEven ? getProtocolForDevice(device.name || '') : null;
                  let armSide: 'left' | 'right' | null = null;
                  if (deviceProtocol instanceof EvenRealitiesG1Protocol) {
                    armSide = deviceProtocol.getArmFromDeviceName(device.name || '');
                  }

                  return (
                    <TouchableOpacity
                      key={device.id}
                      onPress={() => connectToDevice(device)}
                      disabled={connecting}
                      style={[
                        styles.deviceCard,
                        hasEven && styles.evenDeviceCard,
                        connecting && styles.disabledCard,
                      ]}
                    >
                      <View style={styles.deviceCardContent}>
                        <View style={styles.deviceInfo}>
                          <View style={styles.deviceNameRow}>
                            <Text style={styles.deviceCardName}>
                              {device.name || 'Unknown Device'}
                            </Text>
                            {hasEven && (
                              <View style={styles.evenBadge}>
                                <Text style={styles.evenBadgeText}>Even</Text>
                              </View>
                            )}
                            {armSide && (
                              <View style={[styles.armBadge, armSide === 'left' ? styles.leftArmBadge : styles.rightArmBadge]}>
                                <Text style={styles.armBadgeText}>{armSide === 'left' ? 'L' : 'R'}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.deviceCardId}>ID: {device.id}</Text>
                          <View style={styles.deviceMetrics}>
                            {device.rssi && (
                              <Text style={styles.deviceCardRssi}>
                                Signal: {device.rssi} dBm
                              </Text>
                            )}
                            <Text style={styles.deviceCardDistance}>
                              Distance: ~{distance}
                            </Text>
                          </View>
                        </View>
                        {connecting && (
                          <ActivityIndicator size="small" color="#6366F1" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
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
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 0,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#6366F1',
    padding: 20,
    marginBottom: 24,
  },
  statusCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  armsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  armCard: {
    flex: 1,
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(156, 163, 175, 0.3)',
    padding: 12,
    alignItems: 'center',
  },
  armCardConnected: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: '#4CAF50',
  },
  armLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  connectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  connectedText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  armDeviceName: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  armNotConnected: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  testMessageSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(99, 102, 241, 0.2)',
    paddingTop: 16,
    marginTop: 16,
  },
  testMessageLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  targetArmsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
  },
  targetArmsLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    marginRight: 8,
  },
  targetArmBadge: {
    backgroundColor: '#6366F1',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 4,
  },
  targetArmText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  testMessageInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 12,
  },
  sendTestButton: {
    borderRadius: 8,
  },
  sendTestButtonGradient: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  sendTestButtonDisabled: {
    opacity: 0.5,
  },
  sendTestButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(99, 102, 241, 0.2)',
    paddingTop: 12,
    marginTop: 16,
  },
  logTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  logScroll: {
    maxHeight: 150,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 8,
  },
  logText: {
    fontSize: 11,
    color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
  debugSection: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  debugText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
    textAlign: 'center',
  },
  instructions: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  scanButton: {
    marginBottom: 16,
  },
  scanButtonGradient: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  stopButtonText: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 12,
  },
  devicesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    marginTop: 8,
  },
  devicesSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  armBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  leftArmBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  rightArmBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  armBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    padding: 16,
    marginBottom: 12,
  },
  disabledCard: {
    opacity: 0.5,
  },
  deviceCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  deviceCardId: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  deviceCardRssi: {
    fontSize: 12,
    color: '#6B7280',
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  evenDeviceCard: {
    borderColor: '#8B5CF6',
    borderWidth: 2,
    backgroundColor: 'rgba(145, 105, 205, 0.14)',
  },
  evenBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  evenBadgeText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '600',
  },
  deviceMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceCardDistance: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
  videoContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(99, 102, 241, 0.2)',
    paddingTop: 16,
  },
  videoFrame: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    borderRadius: 12,
    marginTop: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenVideo: {
    width: '100%',
    height: '100%',
  },
  floatingControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingButton: {
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  floatingBackButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingBackButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  barcodeOverlay: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  barcodeCard: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    minWidth: 280,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  barcodeType: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barcodeData: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: 2,
  },
  barcodeDismiss: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
  },
  barcodeDismissText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
