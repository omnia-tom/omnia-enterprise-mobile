import { getBleManager, EvenRealitiesG1Protocol, ConnectedArm } from './ble';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONNECTED_LEFT_DEVICE_ID_KEY = 'connected_left_device_id';
const CONNECTED_RIGHT_DEVICE_ID_KEY = 'connected_right_device_id';

/**
 * Store connected device IDs for later use
 */
export const storeConnectedDevices = async (leftDeviceId?: string, rightDeviceId?: string) => {
  try {
    if (leftDeviceId) {
      await AsyncStorage.setItem(CONNECTED_LEFT_DEVICE_ID_KEY, leftDeviceId);
    }
    if (rightDeviceId) {
      await AsyncStorage.setItem(CONNECTED_RIGHT_DEVICE_ID_KEY, rightDeviceId);
    }
  } catch (error) {
    console.error('[GlassesMessaging] Error storing device IDs:', error);
  }
};

/**
 * Get stored connected device IDs
 */
export const getStoredDeviceIds = async (): Promise<{ left?: string; right?: string }> => {
  try {
    const left = await AsyncStorage.getItem(CONNECTED_LEFT_DEVICE_ID_KEY);
    const right = await AsyncStorage.getItem(CONNECTED_RIGHT_DEVICE_ID_KEY);
    return {
      left: left || undefined,
      right: right || undefined,
    };
  } catch (error) {
    console.error('[GlassesMessaging] Error getting device IDs:', error);
    return {};
  }
};

/**
 * Send a text message to connected glasses
 * Uses the same approach as sendTestMessage in BLEConnectionScreen
 */
export const sendMessageToGlasses = async (text: string): Promise<boolean> => {
  try {
    const manager = getBleManager();
    if (!manager) {
      console.error('[GlassesMessaging] BLE Manager not available');
      return false;
    }

    const deviceIds = await getStoredDeviceIds();
    if (!deviceIds.left && !deviceIds.right) {
      console.log('[GlassesMessaging] No connected devices found');
      return false;
    }

    const protocol = new EvenRealitiesG1Protocol();
    
    // Use sequence number 200 for main content display (same as sendTestMessage)
    const currentSeq = 200;
    const messageData = protocol.createTextMessage(text.trim(), currentSeq, false);

    // Convert Uint8Array to base64 (same as sendTestMessage)
    let base64Data: string;
    if (typeof Buffer !== 'undefined') {
      base64Data = Buffer.from(messageData).toString('base64');
    } else {
      const binary = Array.from(messageData).map(byte => String.fromCharCode(byte)).join('');
      base64Data = btoa(binary);
    }

    let sentCount = 0;

    // Send to left arm (same logic as sendTestMessage)
    if (deviceIds.left) {
      try {
        const devices = await manager.connectedDevices([protocol.serviceUUID]);
        const leftDevice = devices.find(d => d.id === deviceIds.left);
        
        if (leftDevice) {
          const services = await leftDevice.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            
            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              console.log('[GlassesMessaging] Message sent to left arm');
              sentCount++;
              // Small delay before right arm (same as sendTestMessage)
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }
      } catch (error: any) {
        console.error('[GlassesMessaging] Error sending to left arm:', error);
      }
    }

    // Send to right arm (same logic as sendTestMessage)
    if (deviceIds.right) {
      try {
        const devices = await manager.connectedDevices([protocol.serviceUUID]);
        const rightDevice = devices.find(d => d.id === deviceIds.right);
        
        if (rightDevice) {
          const services = await rightDevice.services();
          const targetService = services.find(s => s.uuid.toLowerCase() === protocol.serviceUUID.toLowerCase());
          
          if (targetService) {
            const characteristics = await targetService.characteristics();
            const txChar = characteristics.find(c => c.uuid.toLowerCase() === protocol.txCharacteristicUUID.toLowerCase());
            
            if (txChar) {
              await txChar.writeWithoutResponse(base64Data);
              console.log('[GlassesMessaging] Message sent to right arm');
              sentCount++;
            }
          }
        }
      } catch (error: any) {
        console.error('[GlassesMessaging] Error sending to right arm:', error);
      }
    }

    return sentCount > 0;
  } catch (error: any) {
    console.error('[GlassesMessaging] Error sending message:', error);
    return false;
  }
};

