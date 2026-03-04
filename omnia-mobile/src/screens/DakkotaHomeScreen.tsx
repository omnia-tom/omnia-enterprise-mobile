import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { colors, typography, spacing, useThemeColors } from '../theme';
import { Task, TaskCategory, RootStackParamList } from '../types';
import { getAvailableTasks } from '../services/taskData';
import TaskCard from '../components/TaskCard';
import GlassPill from '../components/GlassPill';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WELCOME_SEEN_KEY = '@specTask_welcomeSeen';

const ASSEMBLY_CATEGORIES: (TaskCategory | 'all')[] = [
  'all',
  'front_bumper_grille',
  'front_fascia',
  'rear_bumper',
  'front_suspension',
  'rear_suspension',
  'overhead_systems',
  'tire_wheel',
];

export default function DakkotaHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const theme = useThemeColors();
  const { colors: themeColors, categoryConfig } = theme;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    loadTasks();
    loadProfile();
    AsyncStorage.getItem(WELCOME_SEEN_KEY).then((val) => {
      setShowWelcome(val !== 'true');
    });
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, []);

  const loadProfile = () => {
    const user = auth.currentUser;
    if (!user) return;

    if (user.photoURL) {
      setProfilePhotoUrl(user.photoURL);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.photoUrl || data?.photoURL) {
          setProfilePhotoUrl(data.photoUrl || data.photoURL);
        }
        if (data?.firstName && data?.lastName) {
          setUserInitials(`${data.firstName.charAt(0)}${data.lastName.charAt(0)}`.toUpperCase());
        } else if (data?.email || user.email) {
          setUserInitials((data?.email || user.email || '').charAt(0).toUpperCase());
        }
      } else if (user.email) {
        setUserInitials(user.email.charAt(0).toUpperCase());
      }
    });
    return () => unsub();
  };

  const handleTaskPress = useCallback((task: Task) => {
    navigation.navigate('TaskDetail', { taskId: task.id });
  }, [navigation]);

  const handleGetStarted = useCallback(() => {
    AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  }, []);

  const handlePairDevice = () => {
    navigation.navigate('Pairing');
  };

  const handleDakkotaAssembly = () => {
    navigation.navigate('Consent');
  };

  const handleAccountPress = () => {
    navigation.navigate('Account');
  };

  // First-time welcome overlay — Welcome to SpecTask + Get Started
  if (showWelcome === true) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <MeshBackground variant="warm" />
        <StatusBar style="light" />
        <View style={styles.welcomeContent}>
          <Text style={[styles.welcomeTitle, { color: themeColors.textPrimary }]}>Welcome to SpecTask</Text>
          <Text style={[styles.welcomeSubtitle, { color: themeColors.textSecondary }]}>
            Your assembly tasks are ready. Pair your device, select a station below, and follow step-by-step instructions.
          </Text>
          <TouchableOpacity
            onPress={handleGetStarted}
            style={[styles.getStartedButton, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.getStartedText, { color: '#0D0D12' }]}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderCategoryPill = (cat: TaskCategory | 'all') => {
    const isActive = selectedCategory === cat;
    if (cat === 'all') {
      return (
        <TouchableOpacity key="all" onPress={() => setSelectedCategory('all')}>
          <GlassPill active={isActive} style={styles.pill}>
            <Text style={[styles.pillText, { color: isActive ? '#FFFFFF' : themeColors.textSecondary }]}>All</Text>
          </GlassPill>
        </TouchableOpacity>
      );
    }
    const config = categoryConfig[cat];
    const iconName = (config as { icon?: string })?.icon || 'ellipse-outline';
    return (
      <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)}>
        <GlassPill active={isActive} style={[styles.pill, styles.pillWithIcon]}>
          <Ionicons name={iconName as any} size={16} color={isActive ? '#FFFFFF' : themeColors.textSecondary} />
          <Text style={[styles.pillText, { color: isActive ? '#FFFFFF' : themeColors.textSecondary }]}>
            {config?.label}
          </Text>
        </GlassPill>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />

      {/* Profile icon - top right */}
      <TouchableOpacity style={styles.profileButton} onPress={handleAccountPress}>
        <GlassCard glassStyle="clear" style={styles.avatar}>
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={styles.avatarImage}
              onError={() => setProfilePhotoUrl(null)}
            />
          ) : (
            <Text style={[styles.avatarText, { color: colors.accent }]}>{userInitials}</Text>
          )}
        </GlassCard>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.appName}>SpecTask</Text>
          <Text style={styles.subtitle}>Assembly tasks & device management</Text>
        </View>

        {/* Pair New Device */}
        <TouchableOpacity onPress={handlePairDevice} style={styles.pairButton}>
          <View style={styles.pairButtonInner}>
            <Text style={styles.pairButtonText}>Pair New Device</Text>
          </View>
        </TouchableOpacity>

        {/* Dakkota Assembly - primary CTA */}
        <TouchableOpacity onPress={handleDakkotaAssembly} style={styles.dakkotaButton}>
          <View style={styles.dakkotaButtonInner}>
            <Text style={styles.dakkotaButtonText}>Dakkota Assembly</Text>
            <Text style={styles.dakkotaButtonSubtext}>Workstation scan • Audio consent</Text>
          </View>
        </TouchableOpacity>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterList}
        >
          {ASSEMBLY_CATEGORIES.map(cat => renderCategoryPill(cat))}
        </ScrollView>

        {/* Task list */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : filteredTasks.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>No tasks available</Text>
          </View>
        ) : (
          <>
            <Text style={styles.tasksSectionTitle}>Assembly Tasks</Text>
            {filteredTasks.map((item) => (
              <TaskCard key={item.id} task={item} onPress={handleTaskPress} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  profileButton: {
    position: 'absolute',
    top: 60,
    right: spacing.screenPadding,
    zIndex: 10,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 80,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  pairButton: {
    marginBottom: 12,
  },
  pairButtonInner: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pairButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  dakkotaButton: {
    marginBottom: 24,
  },
  dakkotaButtonInner: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  dakkotaButtonText: {
    color: '#0D0D12',
    fontSize: 16,
    fontWeight: '600',
  },
  dakkotaButtonSubtext: {
    color: 'rgba(13, 13, 18, 0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  filterList: {
    flexShrink: 0,
    marginBottom: 16,
  },
  filterRow: {
    paddingVertical: 6,
    gap: 8,
  },
  pill: {},
  pillWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: {
    ...typography.caption1,
  },
  tasksSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
  },
  welcomeContent: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTitle: {
    ...typography.display,
    marginBottom: 16,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  getStartedButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  getStartedText: {
    ...typography.title2,
  },
});
