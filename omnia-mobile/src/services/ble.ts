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
  createTextMessage(text: string, sequenceNumber?: number): Uint8Array;

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
    // Request battery status: 0xF5 0x0F (request case battery)
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

  createTextMessage(text: string, sequenceNumber: number = 1, manualMode: boolean = true): Uint8Array {
    // Text command format:
    // 0x4E {seq} 0x01 0x00 {newscreen} 0x00 0x00 0x01 0x01 {UTF-8 text}
    const textBytes = new TextEncoder().encode(text);
    const packet = new Uint8Array(9 + textBytes.length);

    packet[0] = 0x4E;  // Command: text display
    packet[1] = sequenceNumber & 0xFF;  // Sequence number
    packet[2] = 0x01;  // Total packages
    packet[3] = 0x00;  // Current package
    // newscreen byte:
    // Lower 4 bits: 0x01 = Display new content
    // Upper 4 bits: 0x50 = Manual mode, 0x70 = Text show
    packet[4] = manualMode ? 0x51 : 0x71;  // Display flags
    packet[5] = 0x00;  // Char position low
    packet[6] = 0x00;  // Char position high
    packet[7] = 0x01;  // Current page
    packet[8] = 0x01;  // Max page

    // Copy text bytes
    packet.set(textBytes, 9);

    return packet;
  }

  parseIncomingData(data: Uint8Array): any {
    if (data.length < 2) return null;

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
          // Acknowledgment - byte[2] contains the sequence number
          if (data.length >= 3) {
            return { type: 'ack', sequenceNumber: data[2] };
          }
          return { type: 'ack' };
        case 17:
          // Glasses status/battery info
          return { type: 'glasses_status' };
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

