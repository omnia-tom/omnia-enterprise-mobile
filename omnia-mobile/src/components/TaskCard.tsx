import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../types/tasks';
import { typography, spacing, useThemeColors } from '../theme';
import { formatCents } from '../services/taskData';

interface TaskCardProps {
  task: Task;
  onPress: (task: Task) => void;
}

export default function TaskCard({ task, onPress }: TaskCardProps) {
  const theme = useThemeColors();
  const { colors, categoryConfig, difficultyConfig } = theme;
  const category = categoryConfig[task.category] || categoryConfig.household;
  const difficulty = difficultyConfig[task.difficulty] || difficultyConfig.beginner;
  const progress = task.maxSubmissions > 0 ? task.currentSubmissions / task.maxSubmissions : 0;

  return (
    <TouchableOpacity
      style={[styles.card, theme.cardStyle]}
      onPress={() => onPress(task)}
      activeOpacity={0.7}
    >
      <View style={styles.topRow}>
        <View style={[styles.emojiCircle, { backgroundColor: category.tint }]}>
          <Text style={styles.emoji}>{category.emoji}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{task.title}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>{task.description}</Text>
        </View>
        <Text style={[styles.payout, { color: colors.earning }]}>{formatCents(task.payoutCents)}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.difficultyPill, { backgroundColor: difficulty.bg }]}>
          <Text style={[styles.difficultyText, { color: difficulty.color }]}>
            {task.difficulty.charAt(0).toUpperCase() + task.difficulty.slice(1)}
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
  emojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  emoji: {
    fontSize: 22,
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
  payout: {
    ...typography.title1,
    flexShrink: 0,
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
