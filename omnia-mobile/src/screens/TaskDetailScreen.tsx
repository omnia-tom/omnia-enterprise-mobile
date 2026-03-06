import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Task } from '../types';
import type { TaskCategory } from '../types';
import { getTaskById } from '../services/taskData';
import { metaWearablesService } from '../services/metaWearables';
import { CAR_SPOTS } from '../config/carSpots';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

const noDotsCarImage = require('../assets/no_dots_car.png');

type Nav = NativeStackNavigationProp<RootStackParamList, 'TaskDetail'>;
type Route = RouteProp<RootStackParamList, 'TaskDetail'>;

export default function TaskDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId, sopContent, procedureId, stationId } = route.params;
  const theme = useThemeColors();
  const { colors, categoryConfig, difficultyConfig } = theme;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [glassesConnected, setGlassesConnected] = useState(false);

  useEffect(() => {
    loadTask();
    // Pre-download/load FastVLM model so it's ready by recording time
    metaWearablesService.preloadVLM().catch(() => {});
  }, []);

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
        <MeshBackground variant="cool" />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <MeshBackground variant="cool" />
        <Text style={[styles.errorText, { color: colors.textTertiary }]}>Task not found</Text>
      </View>
    );
  }

  const category = categoryConfig?.[task?.category] ?? categoryConfig?.household ?? { icon: 'construct-outline', tint: 'rgba(255, 255, 255, 0.08)', label: 'Task' };
  const difficulty = difficultyConfig[task.difficulty] || difficultyConfig.beginner;
  const progress = task.maxSubmissions > 0 ? task.currentSubmissions / task.maxSubmissions : 0;

  const taskSpot = CAR_SPOTS.find((s) => s.category === task.category);
  const isAssemblyTask = !!taskSpot;
  const categoryWithImage = category as { imageSource?: number };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="cool" />
      <StatusBar style={theme.statusBarStyle} />

      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={[styles.backArrow, { color: colors.accent }]}>{'‹'}</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: car diagram + overlay + dot for assembly tasks; fallback for non-assembly */}
        <View style={styles.hero}>
          {isAssemblyTask ? (
            <>
              <View style={styles.carContainer}>
                <Image source={noDotsCarImage} style={styles.carImage} resizeMode="contain" />
                {/* Highlighted part: same icon as homepage TaskCard, overlaid on car outline */}
                {taskSpot && (
                  <View style={[styles.partOverlay, { left: taskSpot.left, top: taskSpot.top, backgroundColor: (category as { tint?: string })?.tint ?? 'rgba(255, 255, 255, 0.15)' }]}>
                    {categoryWithImage?.imageSource ? (
                      <Image
                        source={categoryWithImage.imageSource}
                        style={styles.partOverlayIcon}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons name={(category?.icon ?? 'construct-outline') as any} size={28} color={colors.accent} />
                    )}
                    <View style={styles.partOverlayDot} />
                  </View>
                )}
              </View>
            </>
          ) : (
            <View style={styles.heroIconWrap}>
              {categoryWithImage?.imageSource ? (
                <Image source={categoryWithImage.imageSource} style={styles.heroCategoryIcon} resizeMode="contain" />
              ) : (
                <Ionicons name={(category?.icon ?? 'construct-outline') as any} size={40} color={colors.accent} />
              )}
            </View>
          )}
          <Text style={[styles.heroCategory, { color: colors.textTertiary }]}>{category.label.toUpperCase()}</Text>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{task.title}</Text>
          {stationId && procedureId && (
            <Text style={[styles.stationBadge, { color: colors.textTertiary }]}>
              Station {stationId} · {procedureId}
            </Text>
          )}
        </View>

        {/* Info row (Duration & Difficulty) */}
        <GlassCard style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{task.requiredDuration.minSeconds / 60}-{task.requiredDuration.maxSeconds / 60} min</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Duration</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.separator }]} />
          <View style={styles.infoCol}>
            <View style={[styles.difficultyPill, { backgroundColor: difficulty.bg }]}>
              <Text style={[styles.difficultyText, { color: difficulty.color }]}>
                {difficulty.label}
              </Text>
            </View>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Difficulty</Text>
          </View>
        </GlassCard>

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Description</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{task.description}</Text>
        </View>

        {/* Requirements */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Requirements</Text>
          {task.requirements.map((req, i) => (
            <View key={i} style={styles.checkItem}>
              <Text style={[styles.checkIcon, { color: colors.success }]}>{'✓'}</Text>
              <Text style={[styles.checkText, { color: colors.textPrimary }]}>{req}</Text>
            </View>
          ))}
        </View>

        {/* Instructions - SOP from QR scan takes precedence over task instructions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {sopContent ? 'Assembly SOP (from workstation QR)' : 'Recording Instructions'}
          </Text>
          {sopContent ? (
            <View style={styles.sopContainer}>
              <Text style={[styles.sopText, { color: colors.textSecondary }]} selectable>
                {sopContent}
              </Text>
            </View>
          ) : (
            task.instructions.map((step, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepNumber, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.stepNumberText, { color: colors.accent }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textPrimary }]}>{step}</Text>
              </View>
            ))
          )}
        </View>

        {/* Progress */}
        <View style={styles.section}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {task.currentSubmissions} of {task.maxSubmissions} recordings collected
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: colors.separator }]}>
            <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>

        {/* Spacer for sticky button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaContainer, styles.ctaFallback, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={[styles.ctaButton, { backgroundColor: colors.accent }]} onPress={handleStartRecording} activeOpacity={0.8}>
          <Text style={styles.ctaText}>
            {glassesConnected ? 'Start Recording' : 'Connect Glasses First'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.testOnIphoneLink}
          onPress={() => navigation.navigate('IPhoneTestRecord', { taskId })}
        >
          <Text style={styles.testOnIphoneText}>Test on iPhone</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...typography.body,
  },
  backButton: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 36,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.sectionGap,
    marginTop: 8,
  },
  carContainer: {
    width: '100%',
    aspectRatio: 656 / 437.33334,
    minHeight: 320,
    position: 'relative',
    marginBottom: 16,
  },
  carImage: {
    width: '100%',
    height: '100%',
  },
  partOverlay: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -32,
    marginTop: -32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  partOverlayIcon: {
    width: 52,
    height: 52,
  },
  partOverlayDot: {
    position: 'absolute',
    bottom: 4,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 59, 48, 1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroCategoryIcon: {
    width: 48,
    height: 48,
  },
  heroCategory: {
    ...typography.caption1,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    ...typography.display,
    textAlign: 'center',
  },
  stationBadge: {
    ...typography.caption1,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    padding: 20,
    marginBottom: spacing.sectionGap,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  infoValue: {
    ...typography.title1,
  },
  infoLabel: {
    ...typography.caption1,
  },
  infoDivider: {
    width: 1,
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
    lineHeight: 24,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  checkText: {
    ...typography.body,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  stepText: {
    ...typography.body,
    flex: 1,
    paddingTop: 3,
  },
  sopContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sopText: {
    ...typography.body,
    lineHeight: 24,
    fontSize: 14,
  },
  progressLabel: {
    ...typography.callout,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
  },
  ctaFallback: {
    backgroundColor: 'rgba(12, 12, 18, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  ctaButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#09090F',
    fontSize: 17,
    fontWeight: '600',
  },
  testOnIphoneLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  testOnIphoneText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
});
