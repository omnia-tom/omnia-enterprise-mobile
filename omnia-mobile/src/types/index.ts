import { User } from 'firebase/auth';

// Navigation types
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  Pairing: undefined;
  BLEConnection: {
    deviceId: string;
    deviceName: string;
    savedBleDeviceId?: string;
    savedBleDeviceId_left?: string;
    savedBleDeviceId_right?: string;
  };
  Chat: {
    deviceId: string;
    deviceName: string;
    personaId: string;
  };
};

// Tab Navigator types
export type TabParamList = {
  Home: undefined;
  PickPack: undefined;
};

// Auth types
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Login form types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface LoginError {
  message: string;
  code?: string;
}

// BLE Connection types
export interface ArmConnectionState {
  side: 'left' | 'right';
  connected: boolean;
  deviceId: string;
  deviceName: string;
}

export interface GlassesConnectionState {
  protocolName: string;
  leftArm: ArmConnectionState | null;
  rightArm: ArmConnectionState | null;
  isFullyConnected: boolean;
}
