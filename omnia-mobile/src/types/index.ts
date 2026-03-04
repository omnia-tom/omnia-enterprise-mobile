import { User } from 'firebase/auth';

export * from './tasks';

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
  TaskDetail: { taskId: string; sopContent?: string; procedureId?: string; stationId?: string };
  Recording: { taskId: string };
  Account: undefined;
  /** Dakkota: audio-based consent at workday start */
  Consent: undefined;
  /** Dakkota: workstation selection (pick or scan) */
  WorkstationSelect: undefined;
};

// Tab Navigator types
export type TabParamList = {
  Tasks: undefined;
  Submissions: undefined;
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
