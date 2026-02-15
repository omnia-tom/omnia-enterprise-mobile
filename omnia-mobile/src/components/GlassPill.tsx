import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { glassPillStyle } from '../theme';

interface GlassPillProps extends ViewProps {
  tintColor?: string;
  active?: boolean;
}

export default function GlassPill({
  children,
  style,
  active,
  ...rest
}: GlassPillProps) {
  return (
    <View style={[styles.fallback, active && styles.activeFallback, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...glassPillStyle,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activeFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});
