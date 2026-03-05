/**
 * Full-screen detail for a submission recording.
 * Opens like TaskDetailScreen, with step thumbnails, instructions, and hand/wrist data.
 */
import React, { useEffect, useState } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Submission, StepRecap } from '../types';
import { getSubmissionById } from '../services/taskData';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  recording: { label: 'Recording', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  uploading: { label: 'Uploading', color: '#0A84FF', bg: 'rgba(10, 132, 255, 0.12)' },
  under_review: { label: 'Under Review', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  approved: { label: 'Approved', color: '#30D158', bg: 'rgba(48, 209, 88, 0.12)' },
  rejected: { label: 'Rejected', color: '#FF453A', bg: 'rgba(255, 69, 58, 0.12)' },
};

type Nav = NativeStackNavigationProp<RootStackParamList, 'SubmissionDetail'>;
type Route = RouteProp<RootStackParamList, 'SubmissionDetail'>;

export default function SubmissionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { submissionId } = route.params;
  const theme = useThemeColors();
  const { colors } = theme;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await getSubmissionById(submissionId);
      setSubmission(data ?? null);
      setLoading(false);
    })();
  }, [submissionId]);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <MeshBackground variant="balanced" />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!submission) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <MeshBackground variant="balanced" />
        <Text style={[styles.errorText, { color: colors.textTertiary }]}>Submission not found</Text>
      </View>
    );
  }

  const statusConf = STATUS_CONFIG[submission.status] ?? STATUS_CONFIG.under_review;
  const stepRecaps = submission.stepRecaps ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="balanced" />
      <StatusBar style={theme.statusBarStyle} />

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={[styles.backArrow, { color: colors.accent }]}>{'‹'}</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{submission.taskTitle}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {formatDate(submission.submittedAt)} · {formatDuration(submission.duration)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConf.bg }]}>
              <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
            </View>
          </View>
          {submission.status === 'rejected' && submission.rejectionReason && (
            <Text style={[styles.rejectionText, { color: colors.destructive }]}>
              {submission.rejectionReason}
            </Text>
          )}
        </View>

        {/* Steps with thumbnails and hand data */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recording recap</Text>
          {stepRecaps.length === 0 ? (
            <Text style={[styles.emptySteps, { color: colors.textTertiary }]}>
              No step data captured.
            </Text>
          ) : (
            stepRecaps.map((recap: StepRecap, idx: number) => (
              <GlassCard key={idx} style={styles.stepCard}>
                <View style={styles.stepRow}>
                  <View style={styles.thumbnailWrap}>
                    {recap.stillImageUri ? (
                      <Image
                        source={{ uri: recap.stillImageUri }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.accentMuted }]}>
                        <Ionicons name="image-outline" size={28} color={colors.accent} />
                      </View>
                    )}
                  </View>
                  <View style={styles.stepContent}>
                    <View style={[styles.stepNumBadge, { backgroundColor: colors.accentMuted }]}>
                      <Text style={[styles.stepNumText, { color: colors.accent }]}>
                        {recap.stepIndex + 1}
                      </Text>
                    </View>
                    <Text style={[styles.stepInstruction, { color: colors.textPrimary }]}>
                      {recap.instruction}
                    </Text>
                    {recap.handPoseSample && (
                      <View style={[styles.handDataBox, { borderColor: colors.separator }]}>
                        <Text style={[styles.handDataLabel, { color: colors.textTertiary }]}>
                          Hand pose @ {recap.handPoseSample.timestamp.toFixed(1)}s
                        </Text>
                        <Text style={[styles.handDataDetail, { color: colors.textSecondary }]}>
                          {recap.handPoseSample.hands?.length ?? 0} hand(s),{' '}
                          {recap.handPoseSample.hands?.[0]?.joints?.length ?? 0} joints
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </GlassCard>
            ))
          )}
        </View>

        {/* Overall hand pose samples */}
        {submission.handPoseSamples && submission.handPoseSamples.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Hand/wrist data for labeling
            </Text>
            <GlassCard style={styles.handSummaryCard}>
              <Text style={[styles.handSummaryText, { color: colors.textSecondary }]}>
                {submission.handPoseSamples.length} hand pose samples collected across the recording.
                Timestamps and joint positions available for labeling simplification and processing.
              </Text>
              <View style={[styles.handSampleList, { borderColor: colors.separator }]}>
                {submission.handPoseSamples.slice(0, 5).map((s, i) => (
                  <Text
                    key={i}
                    style={[styles.handSampleItem, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {s.elapsedSec.toFixed(1)}s — {s.hands?.length ?? 0} hand(s)
                  </Text>
                ))}
                {submission.handPoseSamples.length > 5 && (
                  <Text style={[styles.handSampleMore, { color: colors.textTertiary }]}>
                    +{submission.handPoseSamples.length - 5} more
                  </Text>
                )}
              </View>
            </GlassCard>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body },
  backButton: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backArrow: { fontSize: 36, fontWeight: '300', lineHeight: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenPadding },
  hero: { marginBottom: 24 },
  heroTitle: {
    ...typography.title1,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaText: { ...typography.caption1 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { ...typography.caption1, fontWeight: '600' },
  rejectionText: { ...typography.caption1, marginTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: {
    ...typography.title3,
    marginBottom: 12,
  },
  emptySteps: { ...typography.body },
  stepCard: { padding: spacing.cardPadding, marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumbnailWrap: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: { flex: 1 },
  stepNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  stepNumText: { ...typography.caption1, fontWeight: '700' },
  stepInstruction: { ...typography.body, marginBottom: 8 },
  handDataBox: {
    padding: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handDataLabel: { ...typography.caption2, marginBottom: 2 },
  handDataDetail: { ...typography.caption2 },
  handSummaryCard: { padding: spacing.cardPadding },
  handSummaryText: { ...typography.body, marginBottom: 12 },
  handSampleList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  handSampleItem: { ...typography.caption2, marginBottom: 4 },
  handSampleMore: { ...typography.caption2 },
});
