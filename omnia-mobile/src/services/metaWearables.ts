import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { MetaWearablesModule } = NativeModules;

// Event emitter for Meta Wearables events
const metaWearablesEmitter = Platform.OS === 'ios' && MetaWearablesModule
  ? new NativeEventEmitter(MetaWearablesModule)
  : null;

export interface MetaDevice {
  id: string;
  name: string;
  model?: string;
  firmware?: string;
  battery?: number;
  isConnected: boolean;
}

export interface MetaVideoFrame {
  data: string; // Base64 encoded video frame
  timestamp: number;
  width: number;
  height: number;
}

export interface MetaPhoto {
  data: string; // Base64 encoded photo
  timestamp: number;
  width: number;
  height: number;
}

class MetaWearablesService {
  private isAvailable: boolean;
  private currentDevice: MetaDevice | null = null;
  private listeners: Map<string, Array<(data: any) => void>> = new Map();

  constructor() {
    this.isAvailable = Platform.OS === 'ios' && MetaWearablesModule !== undefined;
    
    if (this.isAvailable && metaWearablesEmitter) {
      this.setupEventListeners();
    }
  }

  private setupEventListeners() {
    if (!metaWearablesEmitter) return;

    metaWearablesEmitter.addListener('onDeviceFound', (device: MetaDevice) => {
      this.emit('deviceFound', device);
    });

    metaWearablesEmitter.addListener('onDeviceConnected', (device: MetaDevice) => {
      this.currentDevice = device;
      this.emit('deviceConnected', device);
    });

    metaWearablesEmitter.addListener('onDeviceDisconnected', () => {
      this.currentDevice = null;
      this.emit('deviceDisconnected', {});
    });

    metaWearablesEmitter.addListener('onPairingComplete', (data: { success: boolean; deviceId?: string }) => {
      this.emit('pairingComplete', data);
    });

    metaWearablesEmitter.addListener('onVideoFrame', (frame: MetaVideoFrame) => {
      this.emit('videoFrame', frame);
    });

    metaWearablesEmitter.addListener('onPhotoCaptured', (photo: MetaPhoto) => {
      this.emit('photoCaptured', photo);
    });

    metaWearablesEmitter.addListener('onError', (error: { code: string; message: string }) => {
      this.emit('error', error);
    });
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach(listener => listener(data));
  }

  /**
   * Check if Meta Wearables SDK is available
   */
  isSDKAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Initialize the Meta Wearables SDK
   * Must be called before using any other methods
   */
  async initializeSDK(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.initializeSDK();
  }

  /**
   * Start discovering Meta wearable devices
   */
  async startDiscovery(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startDiscovery();
  }

  /**
   * Stop discovering devices
   */
  async stopDiscovery(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.stopDiscovery();
  }

  /**
   * Connect to a Meta wearable device
   */
  async connectToDevice(deviceId: string): Promise<MetaDevice> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    const device = await MetaWearablesModule.connectToDevice(deviceId);
    this.currentDevice = device;
    return device;
  }

  /**
   * Disconnect from current device
   */
  async disconnectDevice(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    await MetaWearablesModule.disconnectDevice();
    this.currentDevice = null;
  }

  /**
   * Start pairing process with a device
   */
  async startPairing(deviceId: string): Promise<{ success: boolean; deviceId?: string }> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startPairing(deviceId);
  }

  /**
   * Handle OAuth callback URL from Meta AI app
   * Must be called when the app receives a deep link with metaWearablesAction query parameter
   */
  async handleUrl(url: string): Promise<{ success: boolean }> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.handleUrl(url);
  }

  /**
   * Start video streaming
   */
  async startVideoStream(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startVideoStream();
  }

  /**
   * Stop video streaming
   */
  async stopVideoStream(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.stopVideoStream();
  }

  /**
   * Capture a photo
   */
  async capturePhoto(): Promise<MetaPhoto> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.capturePhoto();
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<MetaDevice> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.getDeviceInfo();
  }

  /**
   * Get currently connected device
   */
  getCurrentDevice(): MetaDevice | null {
    return this.currentDevice;
  }

  /**
   * Add event listener
   */
  addEventListener(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, callback: (data: any) => void) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const metaWearablesService = new MetaWearablesService();

