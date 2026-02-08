import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, cardStyle, spacing, categoryConfig, difficultyConfig } from '../theme';
import { RootStackParamList, Task } from '../types';
import { getTaskById, formatCents } from '../services/taskData';
import { metaWearablesService } from '../services/metaWearables';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TaskDetail'>;
type Route = RouteProp<RootStackParamList, 'TaskDetail'>;

export default function TaskDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId } = route.params;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [glassesConnected, setGlassesConnected] = useState(false);

  useEffect(() => {
    loadTask();
  }, []);

  // Re-check glasses connection every time this screen gains focus
  // (e.g. after returning from PairingScreen)
  useFocusEffect(
    useCallback(() => {
      const checkGlasses = async () => {
        try {
          const status = await metaWearablesService.getConnectionStatus();
          setGlassesConnected(status.isConnected);
        } catch {
          setGlassesConnected(false);
        }
      };
      checkGlasses();
    }, [])
  );

  const loadTask = async () => {
    const data = await getTaskById(taskId);
    setTask(data || null);
    setLoading(false);
  };

  const handleStartRecording = () => {
    if (!glassesConnected) {
      navigation.navigate('Pairing');
      return;
    }
    navigation.navigate('Recording', { taskId });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  const category = categoryConfig[task.category] || categoryConfig.household;
  const difficulty = difficultyConfig[task.difficulty] || difficultyConfig.beginner;
  const progress = task.maxSubmissions > 0 ? task.currentSubmissions / task.maxSubmissions : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backArrow}>{'‹'}</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{category.emoji}</Text>
          <Text style={styles.heroCategory}>{category.label}</Text>
          <Text style={styles.heroTitle}>{task.title}</Text>
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.infoValue}>{formatCents(task.payoutCents)}</Text>
            <Text style={styles.infoLabel}>Payout</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <Text style={styles.infoValue}>{task.requiredDuration.minSeconds / 60}-{task.requiredDuration.maxSeconds / 60} min</Text>
            <Text style={styles.infoLabel}>Duration</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <View style={[styles.difficultyPill, { backgroundColor: difficulty.bg }]}>
              <Text style={[styles.difficultyText, { color: difficulty.color }]}>
                {task.difficulty.charAt(0).toUpperCase() + task.difficulty.slice(1)}
              </Text>
            </View>
            <Text style={styles.infoLabel}>Difficulty</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.bodyText}>{task.description}</Text>
        </View>

        {/* Requirements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements</Text>
          {task.requirements.map((req, i) => (
            <View key={i} style={styles.checkItem}>
              <Text style={styles.checkIcon}>{'✓'}</Text>
              <Text style={styles.checkText}>{req}</Text>
            </View>
          ))}
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recording Instructions</Text>
          {task.instructions.map((step, i) => (
            <View key={i} style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Progress */}
        <View style={styles.section}>
          <Text style={styles.progressLabel}>
            {task.currentSubmissions} of {task.maxSubmissions} recordings collected
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
          </View>
        </View>

        {/* Spacer for sticky button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.ctaButton} onPress={handleStartRecording} activeOpacity={0.8}>
          <Text style={styles.ctaText}>
            {glassesConnected ? 'Start Recording' : 'Connect Glasses First'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  backButton: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 36,
    fontWeight: '300',
    color: colors.accent,
    lineHeight: 36,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.sectionGap,
    marginTop: 8,
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroCategory: {
    ...typography.caption1,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    ...typography.display,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: spacing.sectionGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  infoValue: {
    ...typography.title1,
    color: colors.earning,
  },
  infoLabel: {
    ...typography.caption1,
    color: colors.textTertiary,
  },
  infoDivider: {
    width: 1,
    backgroundColor: colors.separator,
    marginHorizontal: 4,
  },
  difficultyPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyText: {
    ...typography.caption1,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.sectionGap,
  },
  sectionTitle: {
    ...typography.title2,
    marginBottom: 12,
  },
  bodyText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkIcon: {
    fontSize: 16,
    color: colors.success,
    fontWeight: '700',
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  checkText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    ...typography.caption1,
    color: colors.accent,
    fontWeight: '700',
  },
  stepText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingTop: 3,
  },
  progressLabel: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.separator,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  ctaButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
