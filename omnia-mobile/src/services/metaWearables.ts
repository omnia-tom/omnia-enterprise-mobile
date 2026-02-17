import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { elevenLabsTTS } from './elevenLabsTTS';

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

export interface MetaConnectionStatus {
  isConnected: boolean;
  registrationState: 'registered' | 'registering' | 'unavailable' | 'not_initialized' | 'unknown';
  deviceCount: number;
  deviceId?: string;
  deviceName?: string;
}

export interface MetaVideoFrame {
  timestamp: number;
  width: number;
  height: number;
  frameNumber: number;
  data?: string; // deprecated — only present for capturePhoto. Frames now render via NativeFrameView.
}

export interface StreamingStats {
  fps: number;
  totalFrames: number;
  droppedFrames: number;
  isRecording: boolean;
  recordingDuration: number;
}

export interface MetaPhoto {
  data: string; // Base64 encoded photo
  timestamp: number;
  width: number;
  height: number;
}

export interface MetaBarcode {
  type: string; // Barcode type (UPC-A, UPC-E, EAN-13, QR, etc.)
  data: string; // Barcode payload/value
  confidence: number; // Detection confidence (0-1)
  timestamp: number;
}

export interface HandJoint {
  name: string;       // "wrist", "thumbCMC", "indexTip", etc.
  x: number;          // 0-1 normalized, left-origin
  y: number;          // 0-1 normalized, top-origin (pre-flipped)
  confidence: number; // 0-1
}

export interface DetectedHand {
  chirality: 'left' | 'right' | 'unknown';
  joints: HandJoint[];
}

export interface HandPoseData {
  hands: DetectedHand[];
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
}

export interface MetaRecordedVideo {
  success: boolean;
  filePath: string; // Path to the saved video file
  frameCount: number; // Number of frames recorded
  duration: number; // Duration in seconds
}

export interface VoiceCommand {
  command: 'next' | 'repeat' | 'done' | 'start';
  transcript: string;
}

export interface StepValidation {
  stepIndex: number;
  validated: boolean;
  checking: boolean;
  response?: string;
  prompt?: string;
}

export interface VLMModelInfo {
  key: string;
  label: string;
  size: string;
}

export interface BenchmarkTestTick {
  elapsed: number;
  total: number;
  frameCount: number;
  avgInferenceMs: number;
  avgE2eMs: number;
  thermalState: string;
  batteryLevel: number;
}

export interface BenchmarkTestComplete {
  scenarioId: number;
  label: string;
  framesProcessed: number;
  durationSeconds: number;
  avgInferenceMs: number;
  p50InferenceMs: number;
  p95InferenceMs: number;
  avgE2eMs: number;
  throughputFps: number;
  avgConfidence: number;
  avgJitterPx: number;
  thermalStart: string;
  thermalEnd: string;
  batteryStart: number;
  batteryEnd: number;
  filePath: string;
}

export interface SystemState {
  thermalState: string;
  batteryLevel: number;
  memoryMB: number;
}

export interface BenchmarkFile {
  name: string;
  path: string;
  sizeKB: number;
  date: string;
}

export interface BenchmarkScenarioConfig {
  id: number;
  label: string;
  computeUnit: string;
  inputFormat: string;
  maxHands: number;
}

export const BENCHMARK_SCENARIOS: BenchmarkScenarioConfig[] = [
  { id: 1, label: 'CPU | PixelBuffer | 2 Hands', computeUnit: 'CPU', inputFormat: 'CVPixelBuffer', maxHands: 2 },
  { id: 2, label: 'Auto | PixelBuffer | 2 Hands', computeUnit: 'Auto', inputFormat: 'CVPixelBuffer', maxHands: 2 },
  { id: 3, label: 'ANE | PixelBuffer | 2 Hands', computeUnit: 'ANE', inputFormat: 'CVPixelBuffer', maxHands: 2 },
  { id: 4, label: 'GPU | PixelBuffer | 2 Hands', computeUnit: 'GPU', inputFormat: 'CVPixelBuffer', maxHands: 2 },
  { id: 5, label: 'Auto | CGImage | 2 Hands', computeUnit: 'Auto', inputFormat: 'CGImage', maxHands: 2 },
  { id: 6, label: 'Auto | PixelBuffer | 1 Hand', computeUnit: 'Auto', inputFormat: 'CVPixelBuffer', maxHands: 1 },
  { id: 7, label: 'CPU | CGImage | 1 Hand', computeUnit: 'CPU', inputFormat: 'CGImage', maxHands: 1 },
];

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

    metaWearablesEmitter.addListener('onBarcodeDetected', (barcode: MetaBarcode) => {
      this.emit('barcodeDetected', barcode);
    });

    metaWearablesEmitter.addListener('onHandPoseDetected', (data: HandPoseData) => {
      this.emit('handPoseDetected', data);
    });

    metaWearablesEmitter.addListener('onVoiceCommand', (command: VoiceCommand) => {
      this.emit('voiceCommand', command);
    });

    metaWearablesEmitter.addListener('onStreamingStats', (stats: StreamingStats) => {
      this.emit('streamingStats', stats);
    });

    metaWearablesEmitter.addListener('onStepValidation', (data: StepValidation) => {
      this.emit('stepValidation', data);
    });

    metaWearablesEmitter.addListener('onBenchmarkTestTick', (data: BenchmarkTestTick) => {
      this.emit('benchmarkTestTick', data);
    });

    metaWearablesEmitter.addListener('onBenchmarkTestComplete', (data: BenchmarkTestComplete) => {
      this.emit('benchmarkTestComplete', data);
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
   * Get device identifier
   */
  async getDeviceIdentifier(): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.getDeviceInfo().then((device: MetaDevice) => device.id);
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
   * Get connection status
   * Returns information about whether Meta glasses are connected
   */
  async getConnectionStatus(): Promise<MetaConnectionStatus> {
    if (!this.isAvailable) {
      return {
        isConnected: false,
        registrationState: 'not_initialized',
        deviceCount: 0,
      };
    }
    return MetaWearablesModule.getConnectionStatus();
  }

  /**
   * Get currently connected device
   */
  getCurrentDevice(): MetaDevice | null {
    return this.currentDevice;
  }

  /**
   * Start recording video from stream frames
   * Must be called while video streaming is active
   */
  async startRecording(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startRecording();
  }

  /**
   * Stop recording and save video file
   * Returns information about the saved video
   */
  async stopRecording(): Promise<MetaRecordedVideo> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.stopRecording();
  }

  /**
   * Speak an instruction via ElevenLabs TTS
   */
  async speakInstruction(text: string): Promise<void> {
    return elevenLabsTTS.speak(text);
  }

  /**
   * Start voice recognition for voice commands (next, repeat, done, start)
   */
  async startVoiceRecognition(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startVoiceRecognition();
  }

  /**
   * Stop voice recognition
   */
  async stopVoiceRecognition(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.stopVoiceRecognition();
  }

  /**
   * Pre-download and load the FastVLM model for step validation.
   * Best called from TaskDetail screen so it's ready by recording time.
   */
  async preloadVLM(): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.preloadVLM();
  }

  /**
   * Start VLM-based validation for a recording step.
   * The model will analyze frames at ~1fps and emit 'stepValidation' events.
   */
  async startStepValidation(stepIndex: number, description: string): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.startStepValidation(stepIndex, description);
  }

  /**
   * Stop step validation and unload the VLM model to free memory.
   */
  async stopStepValidation(): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.stopStepValidation();
  }

  /**
   * Trigger a single-shot VLM check on the current frame.
   * Result arrives via 'stepValidation' event.
   */
  async checkStep(): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.checkStep();
  }

  /**
   * Get available VLM models and the currently selected one.
   */
  async getAvailableVLMModels(): Promise<{ models: VLMModelInfo[]; current: string }> {
    if (!this.isAvailable) return { models: [], current: '' };
    return MetaWearablesModule.getAvailableVLMModels();
  }

  /**
   * Switch to a different VLM model. Unloads current model and loads the new one.
   */
  async setVLMModel(modelKey: string): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.setVLMModel(modelKey);
  }

  /**
   * Start an individual benchmark test for a specific scenario.
   * Runs live inference for durationSeconds. Results arrive via
   * 'benchmarkTestTick' (1/sec) and 'benchmarkTestComplete' events.
   */
  async startIndividualBenchmark(scenarioId: number, durationSeconds: number = 60): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.startIndividualBenchmark(scenarioId, durationSeconds);
  }

  /**
   * Stop the currently running individual benchmark test.
   */
  async stopIndividualBenchmark(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.stopIndividualBenchmark();
  }

  /**
   * Get current system state (thermal, battery, memory).
   */
  async getSystemState(): Promise<SystemState> {
    if (!this.isAvailable) {
      return { thermalState: 'unknown', batteryLevel: -1, memoryMB: 0 };
    }
    return MetaWearablesModule.getSystemState();
  }

  /**
   * List all saved benchmark CSV files.
   */
  async listBenchmarkFiles(): Promise<BenchmarkFile[]> {
    if (!this.isAvailable) return [];
    return MetaWearablesModule.listBenchmarkFiles();
  }

  /**
   * Delete a benchmark CSV file by path.
   */
  async deleteBenchmarkFile(path: string): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.deleteBenchmarkFile(path);
  }

  /**
   * Share a benchmark CSV file using the native iOS share sheet (AirDrop, etc).
   */
  async shareBenchmarkFile(path: string): Promise<void> {
    if (!this.isAvailable) return;
    return MetaWearablesModule.shareBenchmarkFile(path);
  }

  /**
   * Enable or disable hand pose detection
   */
  async setHandPoseEnabled(enabled: boolean): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Meta Wearables SDK is not available on this platform');
    }
    return MetaWearablesModule.setHandPoseEnabled(enabled);
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

