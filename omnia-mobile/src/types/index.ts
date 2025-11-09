import { User } from 'firebase/auth';

// Navigation types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Pairing: undefined;
  Account: undefined;
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
