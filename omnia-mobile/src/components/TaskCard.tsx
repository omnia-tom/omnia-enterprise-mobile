import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types/tasks';
import { typography, spacing, useThemeColors } from '../theme';
import GlassCard from './GlassCard';

interface TaskCardProps {
  task: Task;
  onPress: (task: Task) => void;
}

const DEFAULT_CATEGORY = { icon: 'construct-outline' as const, tint: 'rgba(255, 255, 255, 0.08)', label: 'Task' };

export default function TaskCard({ task, onPress }: TaskCardProps) {
  const theme = useThemeColors();
  const { colors, categoryConfig, difficultyConfig } = theme;
  const category = categoryConfig?.[task?.category] ?? categoryConfig?.household ?? DEFAULT_CATEGORY;
  const iconName = category?.icon ?? 'construct-outline';
  const imageSource = (category as { imageSource?: number })?.imageSource;
  const difficulty = difficultyConfig[task.difficulty] || difficultyConfig.beginner;
  const progress = task.maxSubmissions > 0 ? task.currentSubmissions / task.maxSubmissions : 0;

  return (
    <TouchableOpacity onPress={() => onPress(task)} activeOpacity={0.7}>
      <GlassCard style={styles.card} tintColor={category?.tint ?? DEFAULT_CATEGORY.tint}>
        <View style={styles.topRow}>
          <View style={[styles.iconCircle, { backgroundColor: category?.tint ?? DEFAULT_CATEGORY.tint }]}>
            {imageSource ? (
              <Image source={imageSource} style={styles.categoryIcon} resizeMode="contain" />
            ) : (
              <Ionicons name={iconName as any} size={24} color={colors.accent} />
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{task.title}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>{task.description}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.difficultyPill, { backgroundColor: difficulty.bg }]}>
            <Text style={[styles.difficultyText, { color: difficulty.color }]}>
              {(difficulty as { label?: string }).label ?? task.difficulty.charAt(0).toUpperCase() + task.difficulty.slice(1)}
            </Text>
          </View>
          <Text style={[styles.duration, { color: colors.textTertiary }]}>{task.requiredDuration.minSeconds / 60}-{task.requiredDuration.maxSeconds / 60} min</Text>
        </View>

        <View style={styles.progressRow}>
          <View style={[styles.progressBarBg, { backgroundColor: colors.separator }]}>
            <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textTertiary }]}>{task.currentSubmissions} of {task.maxSubmissions} recorded</Text>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.cardPadding,
    marginBottom: spacing.cardGap,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
    overflow: 'hidden',
  },
  categoryIcon: {
    width: 52,
    height: 52,
  },
  titleBlock: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    ...typography.title2,
    marginBottom: 2,
  },
  description: {
    ...typography.callout,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  difficultyPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  difficultyText: {
    ...typography.caption1,
  },
  duration: {
    ...typography.caption1,
  },
  progressRow: {
    gap: 6,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  progressLabel: {
    ...typography.caption2,
  },
});
