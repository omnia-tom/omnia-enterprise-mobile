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
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { Task, TaskCategory, RootStackParamList } from '../types';
import { getAvailableTasks } from '../services/taskData';
import TaskCard from '../components/TaskCard';
import GlassPill from '../components/GlassPill';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WELCOME_SEEN_KEY = '@specTask_welcomeSeen';

// Dakkota assembly categories (from workers_instructions)
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

export default function TaskBrowserScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const theme = useThemeColors();
  const { colors, categoryConfig } = theme;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    loadTasks();
    loadProfile();
    AsyncStorage.getItem(WELCOME_SEEN_KEY).then((val) => {
      setShowWelcome(val !== 'true'); // Show welcome if not yet seen
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

  const handleGetStarted = useCallback(() => {
    AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  }, []);

  const renderCategoryPill = (cat: TaskCategory | 'all') => {
    const isActive = selectedCategory === cat;
    if (cat === 'all') {
      return (
        <TouchableOpacity key="all" onPress={() => setSelectedCategory('all')}>
          <GlassPill active={isActive} style={styles.pill}>
            <Text style={[styles.pillText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>All</Text>
          </GlassPill>
        </TouchableOpacity>
      );
    }
    const config = categoryConfig[cat];
    const iconName = (config as { icon?: string })?.icon || 'ellipse-outline';
    const imageSource = (config as { imageSource?: number })?.imageSource;
    return (
      <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)}>
        <GlassPill active={isActive} style={[styles.pill, styles.pillWithIcon]}>
          {imageSource ? (
            <Image source={imageSource} style={styles.pillIconImage} resizeMode="contain" />
          ) : (
            <Ionicons name={iconName as any} size={16} color={isActive ? '#FFFFFF' : colors.textSecondary} />
          )}
          <Text style={[styles.pillText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
            {config?.label}
          </Text>
        </GlassPill>
      </TouchableOpacity>
    );
  };

  // Welcome to SpecTask screen — shown before task list on first visit
  if (showWelcome === true) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <MeshBackground variant="cool" />
        <StatusBar style={theme.statusBarStyle} />
        <View style={styles.welcomeContent}>
          <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>Welcome to SpecTask</Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
            Your assembly tasks are ready. Select a station below to view step-by-step instructions and record your procedure.
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="cool" />
      <StatusBar style={theme.statusBarStyle} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tasks</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Account')}>
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
      </View>

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
    backgroundColor: 'transparent',
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
  filterList: {
    flexShrink: 0,
    marginBottom: 12,
  },
  filterRow: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 6,
    gap: 8,
  },
  pill: {},
  pillIconImage: {
    width: 20,
    height: 20,
  },
  pillWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: {
    ...typography.caption1,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
