import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { glassCardStyle } from '../theme';

let GlassViewComponent: any = null;
let glassAvailable = false;

try {
  const glassEffect = require('expo-glass-effect');
  glassAvailable = glassEffect.isLiquidGlassAvailable();
  if (glassAvailable) {
    GlassViewComponent = glassEffect.GlassView;
  }
} catch {
  glassAvailable = false;
}

interface GlassCardProps extends ViewProps {
  tintColor?: string;
  glassStyle?: 'clear' | 'regular';
  interactive?: boolean;
}

export default function GlassCard({
  children,
  style,
  tintColor,
  glassStyle = 'regular',
  interactive = false,
  ...rest
}: GlassCardProps) {
  if (glassAvailable && GlassViewComponent) {
    return (
      <GlassViewComponent
        glassEffectStyle={glassStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        style={[styles.glass, style]}
        {...rest}
      >
        {children}
      </GlassViewComponent>
    );
  }

  return (
    <View style={[styles.fallback, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  fallback: {
    ...glassCardStyle,
  },
});
