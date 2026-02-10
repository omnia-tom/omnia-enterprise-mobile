import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { Task, TaskCategory, RootStackParamList } from '../types';
import { getAvailableTasks, getUserSubmissions, getTotalEarnings, formatCents } from '../services/taskData';
import TaskCard from '../components/TaskCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ALL_CATEGORIES: (TaskCategory | 'all')[] = [
  'all', 'kitchen', 'warehouse', 'household', 'office', 'workshop', 'outdoor', 'personal_care',
];

export default function TaskBrowserScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const theme = useThemeColors();
  const { colors, categoryConfig } = theme;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [totalEarningsCents, setTotalEarningsCents] = useState(0);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    loadTasks();
    loadEarnings();
    loadProfile();
  }, []);

  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredTasks(tasks);
    } else {
      setFilteredTasks(tasks.filter(t => t.category === selectedCategory));
    }
  }, [selectedCategory, tasks]);

  const loadTasks = async () => {
    const data = await getAvailableTasks();
    setTasks(data);
    setFilteredTasks(data);
    setLoading(false);
  };

  const loadEarnings = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const subs = await getUserSubmissions(user.uid);
    setTotalEarningsCents(getTotalEarnings(subs));
  };

  const loadProfile = () => {
    const user = auth.currentUser;
    if (!user) return;

    if (user.photoURL) {
      setProfilePhotoUrl(user.photoURL);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.photoUrl || data.photoURL) {
          setProfilePhotoUrl(data.photoUrl || data.photoURL);
        }
        if (data.firstName && data.lastName) {
          setUserInitials(`${data.firstName.charAt(0)}${data.lastName.charAt(0)}`.toUpperCase());
        } else if (data.email || user.email) {
          setUserInitials((data.email || user.email || '').charAt(0).toUpperCase());
        }
      } else if (user.email) {
        setUserInitials(user.email.charAt(0).toUpperCase());
      }
    });

    return () => unsubscribe();
  };

  const handleTaskPress = useCallback((task: Task) => {
    navigation.navigate('TaskDetail', { taskId: task.id });
  }, [navigation]);

  const renderCategoryPill = (cat: TaskCategory | 'all') => {
    const isActive = selectedCategory === cat;
    if (cat === 'all') {
      return (
        <TouchableOpacity
          key="all"
          style={[styles.pill, { backgroundColor: colors.accentMuted }, isActive && { backgroundColor: colors.accent }]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.pillText, { color: colors.accent }, isActive && styles.pillTextActive]}>All</Text>
        </TouchableOpacity>
      );
    }
    const config = categoryConfig[cat];
    return (
      <TouchableOpacity
        key={cat}
        style={[styles.pill, { backgroundColor: colors.accentMuted }, isActive && { backgroundColor: colors.accent }]}
        onPress={() => setSelectedCategory(cat)}
      >
        <Text style={[styles.pillText, { color: colors.accent }, isActive && styles.pillTextActive]}>
          {config.emoji} {config.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar style={theme.statusBarStyle} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tasks</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Account')}>
          <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={styles.avatarImage}
                onError={() => setProfilePhotoUrl(null)}
              />
            ) : (
              <Text style={[styles.avatarText, { color: colors.accent }]}>{userInitials}</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Earnings pill */}
      <TouchableOpacity
        style={[styles.earningsPill, { backgroundColor: theme.isDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(48, 209, 88, 0.08)' }]}
        onPress={() => navigation.getParent()?.navigate('Submissions')}
      >
        <View style={[styles.earningsDot, { backgroundColor: colors.earning }]} />
        <Text style={[styles.earningsText, { color: colors.earning }]}>
          You've earned {formatCents(totalEarningsCents)}
        </Text>
      </TouchableOpacity>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterList}
      >
        {ALL_CATEGORIES.map(cat => renderCategoryPill(cat))}
      </ScrollView>

      {/* Task list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No tasks available right now</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TaskCard task={item} onPress={handleTaskPress} />}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    ...typography.display,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  earningsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: spacing.screenPadding,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  earningsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  earningsText: {
    ...typography.callout,
    fontWeight: '500',
  },
  filterList: {
    flexShrink: 0,
    marginBottom: 12,
  },
  filterRow: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 6,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: {
    ...typography.caption1,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body,
  },
});
