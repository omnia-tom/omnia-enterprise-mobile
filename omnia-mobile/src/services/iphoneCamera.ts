/**
 * iPhone native camera with real-time hand pose tracking.
 * Used when Meta glasses aren't available. Replaces static DEMO_HAND_POSE.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { iPhoneCameraModule } = NativeModules;

const iphoneCameraEmitter = Platform.OS === 'ios' && iPhoneCameraModule
  ? new NativeEventEmitter(iPhoneCameraModule)
  : null;

export interface HandPoseJoint {
  name: string;
  x: number;
  y: number;
  z?: number;
  confidence: number;
}

export interface DetectedHand {
  chirality: 'left' | 'right' | 'unknown';
  joints: HandPoseJoint[];
}

export interface iPhoneHandPoseData {
  hands: DetectedHand[];
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
}

export const iphoneCamera = {
  isAvailable: (): boolean => Platform.OS === 'ios' && !!iPhoneCameraModule,

  addHandPoseListener: (callback: (data: iPhoneHandPoseData) => void): (() => void) | null => {
    if (!iphoneCameraEmitter) return null;
    const sub = iphoneCameraEmitter.addListener('onHandPoseDetected', callback);
    return () => sub.remove();
  },

  startRecording: async (): Promise<{ filePath: string }> => {
    if (!iPhoneCameraModule) throw new Error('iPhoneCameraModule not available');
    return iPhoneCameraModule.startRecording();
  },

  stopRecording: async (): Promise<{ filePath: string; duration: number }> => {
    if (!iPhoneCameraModule) throw new Error('iPhoneCameraModule not available');
    return iPhoneCameraModule.stopRecording();
  },
};
