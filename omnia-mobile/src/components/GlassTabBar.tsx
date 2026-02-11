import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

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

export default function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.inner, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            {options.tabBarIcon?.({
              focused: isFocused,
              color: isFocused ? colors.accent : colors.textTertiary,
              size: 24,
            })}
            <Text
              style={[
                styles.label,
                { color: isFocused ? colors.accent : colors.textTertiary },
              ]}
            >
              {(options.tabBarLabel as string) || route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (glassAvailable && GlassViewComponent) {
    return (
      <GlassViewComponent glassEffectStyle="regular" style={styles.container}>
        {content}
      </GlassViewComponent>
    );
  }

  return (
    <View style={[styles.container, styles.fallback]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  fallback: {
    backgroundColor: 'rgba(250, 248, 245, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2D9CE',
  },
  inner: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
