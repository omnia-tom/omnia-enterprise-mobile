import { StyleSheet } from 'react-native';
import { useMemo } from 'react';

// ── Color palette (warm Barcelona-modern) ────────────────────
export const colors = {
  background: '#FAF8F5',
  surface: '#F0ECE6',
  textPrimary: '#2A2522',
  textSecondary: '#6B5E54',
  textTertiary: '#9C8F82',
  accent: '#6C5CE7',
  accentMuted: 'rgba(108, 92, 231, 0.10)',
  earning: '#2DA84F',
  success: '#2DA84F',
  warning: '#E6931F',
  destructive: '#D84848',
  separator: '#E2D9CE',
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
  shadowColor: '#2A2522',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

// Backward-compat alias
export const darkCardStyle = cardStyle;

// ── Glass styles (fallback for non-iOS-26) ─────────────────────
export const glassCardStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.65)',
  borderRadius: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(42, 37, 34, 0.06)',
  shadowColor: '#2A2522',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 12,
  elevation: 2,
  overflow: 'hidden' as const,
};

export const glassPillStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.55)',
  borderRadius: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(42, 37, 34, 0.06)',
  overflow: 'hidden' as const,
};

export const spacing = {
  screenPadding: 20,
  sectionGap: 32,
  cardGap: 12,
  cardPadding: 20,
};

// ── Category config ────────────────────────────────────────────
export const categoryConfig: Record<string, { emoji: string; tint: string; label: string }> = {
  kitchen: { emoji: '🍳', tint: 'rgba(230, 147, 31, 0.15)', label: 'Kitchen' },
  warehouse: { emoji: '📦', tint: 'rgba(33, 150, 243, 0.15)', label: 'Warehouse' },
  household: { emoji: '🏠', tint: 'rgba(45, 168, 79, 0.15)', label: 'Household' },
  office: { emoji: '💼', tint: 'rgba(108, 92, 231, 0.15)', label: 'Office' },
  workshop: { emoji: '🔧', tint: 'rgba(230, 147, 31, 0.15)', label: 'Workshop' },
  outdoor: { emoji: '🌿', tint: 'rgba(45, 168, 79, 0.15)', label: 'Outdoor' },
  personal_care: { emoji: '✨', tint: 'rgba(216, 72, 72, 0.15)', label: 'Personal Care' },
};

// Backward-compat alias
export const darkCategoryConfig = categoryConfig;

// ── Difficulty config ──────────────────────────────────────────
export const difficultyConfig: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#2DA84F', bg: 'rgba(45, 168, 79, 0.18)' },
  intermediate: { color: '#E6931F', bg: 'rgba(230, 147, 31, 0.18)' },
  advanced: { color: '#D84848', bg: 'rgba(216, 72, 72, 0.18)' },
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
    isDark: false,
    statusBarStyle: 'dark' as const,
  }), []);
}
