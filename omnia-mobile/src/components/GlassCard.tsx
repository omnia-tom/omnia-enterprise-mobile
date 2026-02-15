import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { glassCardStyle } from '../theme';

interface GlassCardProps extends ViewProps {
  tintColor?: string;
  glassStyle?: 'clear' | 'regular';
  interactive?: boolean;
}

export default function GlassCard({
  children,
  style,
  ...rest
}: GlassCardProps) {
  return (
    <View style={[styles.fallback, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...glassCardStyle,
  },
});
