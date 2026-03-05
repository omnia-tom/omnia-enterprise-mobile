import React from 'react';
import { requireNativeComponent, ViewStyle, Platform } from 'react-native';

interface iPhoneCameraViewProps {
  style?: ViewStyle;
  isActive?: boolean;
}

let NativeiPhoneCameraView: React.ComponentType<iPhoneCameraViewProps> | null = null;
let viewAvailable = false;

if (Platform.OS === 'ios') {
  try {
    NativeiPhoneCameraView = requireNativeComponent<iPhoneCameraViewProps>('iPhoneCameraView');
    viewAvailable = NativeiPhoneCameraView != null;
  } catch {
    viewAvailable = false;
  }
}

export function isiPhoneCameraViewAvailable(): boolean {
  return viewAvailable && NativeiPhoneCameraView != null;
}

export default function iPhoneCameraView({ style, isActive = true }: iPhoneCameraViewProps) {
  if (!NativeiPhoneCameraView) return null;
  return <NativeiPhoneCameraView style={style} isActive={isActive} />;
}
