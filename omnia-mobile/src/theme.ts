import { StyleSheet } from 'react-native';
import { useMemo } from 'react';

// ── Color palette (dark glass) ────────────────────────────────
export const colors = {
  background: '#0D0D12',
  surface: '#1C1C23',
  textPrimary: '#F0F0F5',
  textSecondary: '#8E8E93',
  textTertiary: '#636366',
  accent: '#FFFFFF',
  accentMuted: 'rgba(255, 255, 255, 0.08)',
  earning: '#30D158',
  success: '#30D158',
  warning: '#FF9F0A',
  destructive: '#FF453A',
  separator: 'rgba(255, 255, 255, 0.06)',
};

// Backward-compat aliases
export const darkColors = colors;
export const lightColors = colors;

export const typography = StyleSheet.create({
  display: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  title1: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  title2: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.textPrimary,
  },
  callout: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  caption1: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textTertiary,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textTertiary,
  },
  money: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.earning,
  },
});

// ── Card styles ────────────────────────────────────────────────
export const cardStyle = {
  backgroundColor: colors.surface,
  borderRadius: 16,
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 2,
};

// Backward-compat alias
export const darkCardStyle = cardStyle;

// ── Glass styles (fallback for non-iOS-26) ─────────────────────
// Content cards use SOLID backgrounds for readability.
// Only navigation surfaces (tab bar, sticky CTA) use translucent glass.
export const glassCardStyle = {
  backgroundColor: colors.surface,
  borderRadius: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255, 255, 255, 0.06)',
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 12,
  elevation: 2,
  overflow: 'hidden' as const,
};

export const glassPillStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  borderRadius: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255, 255, 255, 0.06)',
  overflow: 'hidden' as const,
};

export const spacing = {
  screenPadding: 20,
  sectionGap: 32,
  cardGap: 12,
  cardPadding: 20,
};

// ── Category config ────────────────────────────────────────────
// icon: Ionicons name (outline variant for enterprise look)
export const categoryConfig: Record<string, { icon: string; tint: string; label: string }> = {
  kitchen: { icon: 'restaurant-outline', tint: 'rgba(255, 159, 10, 0.12)', label: 'Kitchen' },
  warehouse: { icon: 'cube-outline', tint: 'rgba(100, 210, 255, 0.12)', label: 'Warehouse' },
  household: { icon: 'home-outline', tint: 'rgba(48, 209, 88, 0.12)', label: 'Household' },
  office: { icon: 'briefcase-outline', tint: 'rgba(255, 255, 255, 0.08)', label: 'Office' },
  workshop: { icon: 'construct-outline', tint: 'rgba(255, 159, 10, 0.12)', label: 'Workshop' },
  outdoor: { icon: 'leaf-outline', tint: 'rgba(48, 209, 88, 0.12)', label: 'Outdoor' },
  personal_care: { icon: 'sparkles-outline', tint: 'rgba(255, 69, 58, 0.12)', label: 'Personal Care' },
  // Dakkota assembly (professional icons)
  front_bumper_grille: { icon: 'car-outline', tint: 'rgba(100, 210, 255, 0.15)', label: 'Front Bumper & Grille' },
  front_fascia: { icon: 'square-outline', tint: 'rgba(100, 210, 255, 0.15)', label: 'Front Fascia' },
  rear_bumper: { icon: 'car-sport-outline', tint: 'rgba(80, 80, 90, 0.2)', label: 'Rear Bumper' },
  front_suspension: { icon: 'construct-outline', tint: 'rgba(255, 159, 10, 0.15)', label: 'Front Suspension' },
  rear_suspension: { icon: 'git-merge-outline', tint: 'rgba(255, 159, 10, 0.15)', label: 'Rear Suspension' },
  overhead_systems: { icon: 'hardware-chip-outline', tint: 'rgba(48, 209, 88, 0.15)', label: 'Overhead Systems' },
  tire_wheel: { icon: 'disc-outline', tint: 'rgba(48, 209, 88, 0.15)', label: 'Tire & Wheel Assembly' },
};

// Backward-compat alias
export const darkCategoryConfig = categoryConfig;

// ── Difficulty config ──────────────────────────────────────────
export const difficultyConfig: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#30D158', bg: 'rgba(48, 209, 88, 0.15)' },
  intermediate: { color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.15)' },
  advanced: { color: '#FF453A', bg: 'rgba(255, 69, 58, 0.15)' },
};

// Backward-compat alias
export const darkDifficultyConfig = difficultyConfig;

// ── Theme hook ─────────────────────────────────────────────────
export function useThemeColors() {
  return useMemo(() => ({
    colors,
    cardStyle,
    categoryConfig,
    difficultyConfig,
    isDark: true,
    statusBarStyle: 'light' as const,
  }), []);
}
