import { BleManager, State, Device, Characteristic } from 'react-native-ble-plx';

let bleManagerInstance: BleManager | null = null;

export const getBleManager = (): BleManager | null => {
  try {
    if (!bleManagerInstance) {
      bleManagerInstance = new BleManager();
    }
    return bleManagerInstance;
  } catch (error) {
    console.error('Error creating BleManager:', error);
    return null;
  }
};

export const destroyBleManager = () => {
  if (bleManagerInstance) {
    try {
      bleManagerInstance.destroy();
    } catch (error) {
      console.error('Error destroying BleManager:', error);
    }
    bleManagerInstance = null;
  }
};

export const isBleAvailable = (): boolean => {
  try {
    const manager = getBleManager();
    return manager !== null;
  } catch {
    return false;
  }
};

// ============================================================================
// PROTOCOL INTERFACES
// ============================================================================

export interface GlassesProtocol {
  name: string;
  serviceUUID: string;
  txCharacteristicUUID: string;
  rxCharacteristicUUID: string;

  // Device identification
  isCompatibleDevice(deviceName: string): boolean;
  requiresDualArm(): boolean;

  // Connection lifecycle
  getInitCommand(): Uint8Array;

  // Messaging
  createTextMessage(text: string, sequenceNumber?: number, replaceContent?: boolean): Uint8Array;

  // Control commands
  getManualModeCommand?(): Uint8Array;
  getExitCommand?(): Uint8Array;
  getBatteryRequestCommand?(): Uint8Array;

  // Event handling
  parseIncomingData?(data: Uint8Array): any;
}

export interface ConnectedArm {
  side: 'left' | 'right';
  device: Device;
  txCharacteristic: Characteristic | null;
  rxCharacteristic: Characteristic | null;
}

// ============================================================================
// EVEN REALITIES G1 PROTOCOL
// ============================================================================

export class EvenRealitiesG1Protocol implements GlassesProtocol {
  name = 'Even Realities G1';

  // Nordic UART Service UUIDs
  serviceUUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
  txCharacteristicUUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
  rxCharacteristicUUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

  isCompatibleDevice(deviceName: string): boolean {
    const nameLower = deviceName.toLowerCase();
    // Even Realities G1 devices have _L_ or _R_ in their names
    return nameLower.includes('even') ||
           (nameLower.includes('_l_') || nameLower.includes('_r_'));
  }

  requiresDualArm(): boolean {
    return true;
  }

  getInitCommand(): Uint8Array {
    // Init command: 0x4D 0x01
    return new Uint8Array([0x4D, 0x01]);
  }

  getBatteryRequestCommand(): Uint8Array {
    // Request battery and firmware info: 0x2C 0x01
    // This returns both left and right glasses battery levels
    return new Uint8Array([0x2C, 0x01]);
  }

  getCaseBatteryRequestCommand(): Uint8Array {
    // Request case battery status: 0xF5 0x0F
    return new Uint8Array([0xF5, 0x0F]);
  }

  getManualModeCommand(): Uint8Array {
    // Enter manual/page mode: 0xF5 0x01
    return new Uint8Array([0xF5, 0x01]);
  }

  getExitCommand(): Uint8Array {
    // Exit to dashboard: 0xF5 0x00
    return new Uint8Array([0xF5, 0x00]);
  }

  createTextMessage(text: string, sequenceNumber: number = 1, replaceContent: boolean = true): Uint8Array {
    // Text command format:
    // 0x4E {seq} 0x01 0x00 {newscreen} 0x00 0x00 0x01 0x01 {UTF-8 text}
    const textBytes = new TextEncoder().encode(text);
    const packet = new Uint8Array(9 + textBytes.length);

    packet[0] = 0x4E;  // Command: text display
    packet[1] = sequenceNumber & 0xFF;  // Sequence number
    packet[2] = 0x01;  // Total packages
    packet[3] = 0x00;  // Current package

    // newscreen byte controls display behavior:
    // 0x51 = Manual mode + new content (0x50 | 0x01) - REPLACES content
    // 0x71 = Text show + new content (0x70 | 0x01) - May APPEND content
    packet[4] = replaceContent ? 0x51 : 0x71;  // Use manual mode flag to force replace

    packet[5] = 0x00;  // Char position low (0 = start of line)
    packet[6] = 0x00;  // Char position high
    packet[7] = 0x01;  // Current page
    packet[8] = 0x01;  // Max page

    // Copy text bytes
    packet.set(textBytes, 9);

    return packet;
  }

  parseIncomingData(data: Uint8Array): any {
    if (data.length < 2) return null;

    // Battery and firmware info response (0x2C = 44)
    if (data[0] === 44 || data[0] === 0x2C) {
      // Response format from wiki:
      // 0x2C [Model(A/B)] [Left Battery 0-100] [Right Battery 0-100] [00 00 00] [firmware versions...]
      console.log('Battery info response (0x2C):', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

      if (data.length >= 4) {
        // Byte 1: Model ('A' or 'B' in ASCII, could be 0x41 or 0x42)
        const model = String.fromCharCode(data[1]);
        // Byte 2: Left battery (0-100)
        const leftBattery = data[2];
        // Byte 3: Right battery (0-100)
        const rightBattery = data[3];

        return {
          type: 'battery_info_response',
          model: model,
          leftBattery: leftBattery,
          rightBattery: rightBattery,
          rawData: Array.from(data),
          hexString: Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
        };
      }

      // Fallback if data is too short
      return {
        type: 'battery_info_response',
        rawData: Array.from(data),
        hexString: Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
      };
    }

    // Device events (0xF5 = 245)
    if (data[0] === 245 || data[0] === 0xF5) {
      const eventType = data[1];
      switch (eventType) {
        case 0:
          return { type: 'single_tap' };
        case 1:
          return { type: 'double_tap' };
        case 6:
          return { type: 'glasses_on' };
        case 7:
          return { type: 'glasses_off' };
        case 8:
          return { type: 'in_case_lid_open' };
        case 9:
          return { type: 'charging' };
        case 14:
          return { type: 'case_charging' };
        case 15:
          // Case battery percentage is in byte[2]
          if (data.length >= 3) {
            return { type: 'case_battery', percentage: data[2] };
          }
          return { type: 'case_battery', percentage: null };
        case 10:
          // 0x0A can be either ACK or glasses battery level
          if (data.length >= 3) {
            // If byte[2] is in battery range (0-100), it's battery level
            if (data[2] <= 100) {
              return { type: 'glasses_battery', percentage: data[2] };
            }
            return { type: 'ack', sequenceNumber: data[2] };
          }
          return { type: 'ack' };
        case 17:
          // Glasses status/battery info (0xF5 0x11)
          // The response contains 20 bytes of status data
          // We need to find where the battery percentage is
          console.log('Glasses status (0x11) full data:', Array.from(data));

          // Try common battery positions in the payload
          if (data.length >= 3) {
            // Battery might be in byte 2 (0-100 range)
            const possibleBattery = data[2];
            if (possibleBattery <= 100) {
              return {
                type: 'glasses_status',
                battery: possibleBattery,
                rawData: Array.from(data)
              };
            }
          }

          return {
            type: 'glasses_status',
            rawData: Array.from(data)
          };
        default:
          // Log unknown event types for debugging
          return { type: 'unknown_event', eventType, rawData: Array.from(data) };
      }
    }

    return null;
  }

  getArmFromDeviceName(deviceName: string): 'left' | 'right' | null {
    const nameLower = deviceName.toLowerCase();

    // Check for various left arm patterns
    if (nameLower.includes('_l_') ||
        nameLower.includes('_l') ||
        nameLower.includes('l_') ||
        nameLower.includes('left') ||
        nameLower.match(/\bl\b/)) {  // standalone 'l'
      return 'left';
    }

    // Check for various right arm patterns
    if (nameLower.includes('_r_') ||
        nameLower.includes('_r') ||
        nameLower.includes('r_') ||
        nameLower.includes('right') ||
        nameLower.match(/\br\b/)) {  // standalone 'r'
      return 'right';
    }

    return null;
  }
}

// ============================================================================
// PROTOCOL REGISTRY
// ============================================================================

const protocols: GlassesProtocol[] = [
  new EvenRealitiesG1Protocol(),
  // Add more protocols here as needed
];

export const getProtocolForDevice = (deviceName: string): GlassesProtocol | null => {
  for (const protocol of protocols) {
    if (protocol.isCompatibleDevice(deviceName)) {
      return protocol;
    }
  }
  return null;
};

export const getAllProtocols = (): GlassesProtocol[] => {
  return protocols;
};

