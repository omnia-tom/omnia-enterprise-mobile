import { requireNativeComponent, ViewStyle, Platform } from 'react-native';

interface NativeFrameViewProps {
  isActive?: boolean;
  contentMode?: 'cover' | 'contain';
  style?: ViewStyle;
}

const NativeFrameView = Platform.OS === 'ios'
  ? requireNativeComponent<NativeFrameViewProps>('MetaFrameView')
  : null;

export default NativeFrameView;
