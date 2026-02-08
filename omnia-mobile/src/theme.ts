import { StyleSheet } from 'react-native';

export const colors = {
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

export const cardStyle = {
  backgroundColor: colors.surface,
  borderRadius: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 2,
};

export const spacing = {
  screenPadding: 20,
  sectionGap: 32,
  cardGap: 12,
  cardPadding: 20,
};

export const categoryConfig: Record<string, { emoji: string; tint: string; label: string }> = {
  kitchen: { emoji: '🍳', tint: '#FFF3E0', label: 'Kitchen' },
  warehouse: { emoji: '📦', tint: '#E3F2FD', label: 'Warehouse' },
  household: { emoji: '🏠', tint: '#E8F5E9', label: 'Household' },
  office: { emoji: '💼', tint: '#F3E5F5', label: 'Office' },
  workshop: { emoji: '🔧', tint: '#FFF8E1', label: 'Workshop' },
  outdoor: { emoji: '🌿', tint: '#E0F2F1', label: 'Outdoor' },
  personal_care: { emoji: '✨', tint: '#FCE4EC', label: 'Personal Care' },
};

export const difficultyConfig: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#34C759', bg: 'rgba(52, 199, 89, 0.12)' },
  intermediate: { color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  advanced: { color: '#FF3B30', bg: 'rgba(255, 59, 48, 0.12)' },
};
