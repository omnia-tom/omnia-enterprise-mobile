import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';

const ariaShadowsImage = require('../assets/ARIA_Shadows.png');

/**
 * Preview card showing Project ARIA Gen2 glasses (with built-in shadow).
 * Liquid/transparent styling to match Pair New Device button.
 * Used when "pair to ARIA" is clicked (demo mode - no actual ARIA integration).
 */
export default function PairedProductCard() {
  return (
    <View style={styles.card}>
      <View style={styles.iconsRow}>
        <Ionicons name="bluetooth" size={16} color="#000000" />
        <Ionicons name="battery-full" size={16} color="#000000" />
        <Ionicons name="wifi" size={16} color={colors.success} />
      </View>
      <View style={styles.glassesWrapper}>
        <Image source={ariaShadowsImage} style={styles.glassesImage} resizeMode="contain" />
      </View>
      <Text style={styles.connected}>connected</Text>
      <Text style={styles.username}>Supervisor name or username</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    paddingBottom: 18,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'visible',
  },
  iconsRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  glassesWrapper: {
    marginTop: -20,
    marginBottom: -60,
    alignItems: 'center',
    overflow: 'visible',
    transform: [{ translateY: -50 }],
  },
  glassesImage: {
    width: 450,
    height: 270,
  },
  connected: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    marginTop: -60,
    marginBottom: 2,
  },
  username: {
    ...typography.caption1,
    color: colors.textSecondary,
  },
});
