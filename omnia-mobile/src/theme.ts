import { StyleSheet, useColorScheme } from 'react-native';
import { useMemo } from 'react';

// ── Light palette ──────────────────────────────────────────────
export const lightColors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#86868B',
  textTertiary: '#AEAEB2',
  accent: '#6366F1',
  accentMuted: 'rgba(99, 102, 241, 0.08)',
  earning: '#30D158',
  success: '#34C759',
  warning: '#FF9F0A',
  destructive: '#FF3B30',
  separator: '#E5E5EA',
};

// ── Dark palette ───────────────────────────────────────────────
export const darkColors = {
  background: '#000000',
  surface: '#1C1C1E',
  textPrimary: '#F2F2F7',
  textSecondary: '#98989D',
  textTertiary: '#636366',
  accent: '#818CF8',
  accentMuted: 'rgba(129, 140, 248, 0.15)',
  earning: '#32D74B',
  success: '#30D158',
  warning: '#FFD60A',
  destructive: '#FF453A',
  separator: '#38383A',
};

// Backward-compat export
export const colors = lightColors;

export const typography = StyleSheet.create({
  display: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: lightColors.textPrimary,
  },
  title1: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: lightColors.textPrimary,
  },
  title2: {
    fontSize: 17,
    fontWeight: '600',
    color: lightColors.textPrimary,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    color: lightColors.textPrimary,
  },
  callout: {
    fontSize: 15,
    fontWeight: '400',
    color: lightColors.textSecondary,
  },
  caption1: {
    fontSize: 13,
    fontWeight: '500',
    color: lightColors.textTertiary,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    color: lightColors.textTertiary,
  },
  money: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: lightColors.earning,
  },
});

// ── Card styles ────────────────────────────────────────────────
export const cardStyle = {
  backgroundColor: lightColors.surface,
  borderRadius: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 2,
};

export const darkCardStyle = {
  backgroundColor: darkColors.surface,
  borderRadius: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 2,
};

export const spacing = {
  screenPadding: 20,
  sectionGap: 32,
  cardGap: 12,
  cardPadding: 20,
};

// ── Category config ────────────────────────────────────────────
export const categoryConfig: Record<string, { emoji: string; tint: string; label: string }> = {
  kitchen: { emoji: '🍳', tint: '#FFF3E0', label: 'Kitchen' },
  warehouse: { emoji: '📦', tint: '#E3F2FD', label: 'Warehouse' },
  household: { emoji: '🏠', tint: '#E8F5E9', label: 'Household' },
  office: { emoji: '💼', tint: '#F3E5F5', label: 'Office' },
  workshop: { emoji: '🔧', tint: '#FFF8E1', label: 'Workshop' },
  outdoor: { emoji: '🌿', tint: '#E0F2F1', label: 'Outdoor' },
  personal_care: { emoji: '✨', tint: '#FCE4EC', label: 'Personal Care' },
};

export const darkCategoryConfig: Record<string, { emoji: string; tint: string; label: string }> = {
  kitchen: { emoji: '🍳', tint: 'rgba(255, 152, 0, 0.15)', label: 'Kitchen' },
  warehouse: { emoji: '📦', tint: 'rgba(33, 150, 243, 0.15)', label: 'Warehouse' },
  household: { emoji: '🏠', tint: 'rgba(76, 175, 80, 0.15)', label: 'Household' },
  office: { emoji: '💼', tint: 'rgba(156, 39, 176, 0.15)', label: 'Office' },
  workshop: { emoji: '🔧', tint: 'rgba(255, 235, 59, 0.15)', label: 'Workshop' },
  outdoor: { emoji: '🌿', tint: 'rgba(0, 150, 136, 0.15)', label: 'Outdoor' },
  personal_care: { emoji: '✨', tint: 'rgba(233, 30, 99, 0.15)', label: 'Personal Care' },
};

// ── Difficulty config ──────────────────────────────────────────
export const difficultyConfig: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#34C759', bg: 'rgba(52, 199, 89, 0.12)' },
  intermediate: { color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  advanced: { color: '#FF3B30', bg: 'rgba(255, 59, 48, 0.12)' },
};

export const darkDifficultyConfig: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#30D158', bg: 'rgba(48, 209, 88, 0.18)' },
  intermediate: { color: '#FFD60A', bg: 'rgba(255, 214, 10, 0.18)' },
  advanced: { color: '#FF453A', bg: 'rgba(255, 69, 58, 0.18)' },
};

// ── Theme hook ─────────────────────────────────────────────────
export function useThemeColors() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return useMemo(() => ({
    colors: isDark ? darkColors : lightColors,
    cardStyle: isDark ? darkCardStyle : cardStyle,
    categoryConfig: isDark ? darkCategoryConfig : categoryConfig,
    difficultyConfig: isDark ? darkDifficultyConfig : difficultyConfig,
    isDark,
    statusBarStyle: (isDark ? 'light' : 'dark') as 'light' | 'dark',
  }), [isDark]);
}
