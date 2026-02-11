import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { glassPillStyle, colors } from '../theme';

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

interface GlassPillProps extends ViewProps {
  tintColor?: string;
  active?: boolean;
}

export default function GlassPill({
  children,
  style,
  tintColor,
  active,
  ...rest
}: GlassPillProps) {
  if (glassAvailable && GlassViewComponent) {
    return (
      <GlassViewComponent
        glassEffectStyle="clear"
        tintColor={active ? colors.accent : tintColor}
        style={[styles.glass, active && styles.activeGlass, style]}
        {...rest}
      >
        {children}
      </GlassViewComponent>
    );
  }

  return (
    <View style={[styles.fallback, active && styles.activeFallback, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activeGlass: {
    // native glass handles active tinting
  },
  fallback: {
    ...glassPillStyle,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activeFallback: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
});
