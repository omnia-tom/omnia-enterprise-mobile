import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { Submission, SubmissionStatus } from '../types';
import { getUserSubmissions, getTotalEarnings, formatCents } from '../services/taskData';
import GlassCard from '../components/GlassCard';
import GlassPill from '../components/GlassPill';
import MeshBackground from '../components/MeshBackground';

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; color: string; bg: string }> = {
  recording: { label: 'Recording', color: '#E6931F', bg: 'rgba(230, 147, 31, 0.12)' },
  uploading: { label: 'Uploading', color: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)' },
  under_review: { label: 'Under Review', color: '#E6931F', bg: 'rgba(230, 147, 31, 0.12)' },
  approved: { label: 'Approved', color: '#2DA84F', bg: 'rgba(45, 168, 79, 0.12)' },
  rejected: { label: 'Rejected', color: '#D84848', bg: 'rgba(216, 72, 72, 0.12)' },
};

const FILTERS: { key: 'all' | SubmissionStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function SubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const { colors } = theme;
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<'all' | SubmissionStatus>('all');

  useFocusEffect(
    useCallback(() => {
      loadSubmissions();
    }, [])
  );

  const loadSubmissions = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const subs = await getUserSubmissions(user.uid);
    setSubmissions(subs.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()));
  };

  const filtered = filter === 'all' ? submissions : submissions.filter(s => s.status === filter);
  const totalEarned = getTotalEarnings(submissions);
  const approvedCount = submissions.filter(s => s.status === 'approved').length;
  const approvalRate = submissions.length > 0
    ? Math.round((approvedCount / submissions.length) * 100)
    : 0;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderSubmission = ({ item }: { item: Submission }) => {
    const statusConf = STATUS_CONFIG[item.status];
    return (
      <GlassCard style={styles.subCard}>
        <View style={styles.subTopRow}>
          <Text style={[styles.subTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.taskTitle}</Text>
          <Text style={[styles.subPayout, { color: colors.earning }]}>{formatCents(item.payoutCents)}</Text>
        </View>
        <View style={styles.subMeta}>
          <Text style={[styles.subDate, { color: colors.textTertiary }]}>{formatDate(item.submittedAt)}</Text>
          <Text style={[styles.subDuration, { color: colors.textTertiary }]}>{formatDuration(item.duration)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.bg }]}>
            <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
          </View>
        </View>
        {item.status === 'rejected' && item.rejectionReason && (
          <Text style={[styles.rejectionText, { color: colors.destructive }]}>{item.rejectionReason}</Text>
        )}
      </GlassCard>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="balanced" />
      <StatusBar style={theme.statusBarStyle} />

      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Submissions</Text>

      {/* Summary card */}
      <GlassCard style={styles.summaryCard}>
        <View style={styles.summaryCol}>
          <Text style={[styles.summaryValue, { color: colors.earning }]}>{formatCents(totalEarned)}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Total Earned</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.summaryCol}>
          <Text style={[styles.summaryValueDefault, { color: colors.textPrimary }]}>{submissions.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Submitted</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.summaryCol}>
          <Text style={[styles.summaryValueDefault, { color: colors.textPrimary }]}>{approvalRate}%</Text>
          <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Approval</Text>
        </View>
      </GlassCard>

      {/* Filter tabs */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS}
        keyExtractor={(item) => item.key}
        renderItem={({ item: f }) => (
          <TouchableOpacity onPress={() => setFilter(f.key)}>
            <GlassPill active={filter === f.key} style={styles.filterPill}>
              <Text style={[styles.filterText, { color: filter === f.key ? '#FFFFFF' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </GlassPill>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.filterRow}
        style={styles.filterList}
      />

      {/* List */}
      {filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {submissions.length === 0
              ? 'No submissions yet. Browse tasks to get started.'
              : 'No submissions match this filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderSubmission}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    ...typography.display,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.screenPadding,
    padding: 20,
    marginBottom: 20,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    ...typography.money,
  },
  summaryValueDefault: {
    ...typography.title1,
  },
  summaryLabel: {
    ...typography.caption1,
  },
  summaryDivider: {
    width: 1,
    marginHorizontal: 4,
  },
  filterList: {
    flexShrink: 0,
    marginBottom: 16,
  },
  filterRow: {
    paddingHorizontal: spacing.screenPadding,
    gap: 8,
  },
  filterPill: {
    // GlassPill handles padding/radius
  },
  filterText: {
    ...typography.caption1,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },
  subCard: {
    padding: spacing.cardPadding,
    marginBottom: spacing.cardGap,
  },
  subTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subTitle: {
    ...typography.title2,
    flex: 1,
    marginRight: 12,
  },
  subPayout: {
    ...typography.title1,
  },
  subMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subDate: {
    ...typography.caption2,
  },
  subDuration: {
    ...typography.caption2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    ...typography.caption1,
    fontWeight: '600',
  },
  rejectionText: {
    ...typography.caption1,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
