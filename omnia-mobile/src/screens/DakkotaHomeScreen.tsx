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
import { CAR_SPOTS } from '../config/carSpots';
import TaskCard from '../components/TaskCard';
import GlassPill from '../components/GlassPill';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';
import PairedProductCard from '../components/PairedProductCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WELCOME_SEEN_KEY = '@specTask_welcomeSeen';

const dakkotaLogo = require('../assets/Dakkota-Logo-2.png');
const whiteButtonQrCode = require('../assets/white_button_QR_Code.png');
const noDotsCarImage = require('../assets/no_dots_car.png');
const beginnerIcon = require('../assets/beginner.png');
const intermediateIcon = require('../assets/intermediate.png');
const veteranIcon = require('../assets/veteran.png');

const ASSEMBLY_CATEGORIES: (TaskCategory | 'all')[] = [
  'all',
  'front_bumper_grille',
  'front_fascia',
  'rear_bumper',
  'front_suspension',
  'rear_suspension',
  'overhead_systems',
  'tire_wheel',
  'rear_fascia',
];

type DifficultyFilter = 'all' | Task['difficulty'];

export default function DakkotaHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const theme = useThemeColors();
  const { colors: themeColors, categoryConfig } = theme;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | 'all'>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter>('all');
  const [showAriaPreview, setShowAriaPreview] = useState(false);
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
    let result = tasks;
    if (selectedCategory !== 'all') {
      result = result.filter(t => t.category === selectedCategory);
    }
    if (selectedDifficulty !== 'all') {
      result = result.filter(t => t.difficulty === selectedDifficulty);
    }
    setFilteredTasks(result);
  }, [selectedCategory, selectedDifficulty, tasks]);

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
        <View style={styles.logoButton}>
          <Image source={dakkotaLogo} style={styles.logoImage} resizeMode="contain" />
        </View>
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />

      {/* Dakkota logo - top left */}
      <View style={styles.logoButton}>
        <Image source={dakkotaLogo} style={styles.logoImage} resizeMode="contain" />
      </View>

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
        <View style={styles.pairSection}>
          <TouchableOpacity onPress={handlePairDevice} style={styles.pairButton}>
            <View style={styles.pairButtonInner}>
              <Text style={styles.pairButtonText}>Pair New Device</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAriaPreview(p => !p)}
            style={styles.pairToAriaTouchable}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.pairToAriaText}>pair to ARIA</Text>
          </TouchableOpacity>
        </View>

        {/* ARIA paired product preview (demo) */}
        {showAriaPreview && <PairedProductCard />}

        {/* Dakkota Assembly - white_button_QR_Code.png, text centered per updated_design */}
        <TouchableOpacity onPress={handleDakkotaAssembly} style={styles.dakkotaButton} activeOpacity={0.9}>
          <View style={styles.dakkotaButtonWrapper}>
            <Image
              source={whiteButtonQrCode}
              style={styles.dakkotaButtonImage}
              resizeMode="contain"
            />
            <View style={styles.dakkotaButtonContent} pointerEvents="none">
              <Text style={styles.dakkotaButtonText}>Dakkota Assembly</Text>
              <Text style={styles.dakkotaButtonSubtext}>Workstation scan • Audio consent</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Car with spots - category filter */}
        <View style={styles.carFilterSection}>
          <View style={styles.carContainer}>
            <Image source={noDotsCarImage} style={styles.carImage} resizeMode="contain" />
            {CAR_SPOTS.map((spot) => {
              const isActive = selectedCategory === spot.category;
              return (
                <TouchableOpacity
                  key={spot.category}
                  style={[
                    styles.carSpot,
                    { left: spot.left, top: spot.top },
                    isActive && styles.carSpotActive,
                  ]}
                  onPress={() => setSelectedCategory(selectedCategory === spot.category ? 'all' : spot.category)}
                  activeOpacity={0.8}
                />
              );
            })}
          </View>
          {selectedCategory !== 'all' && (
            <TouchableOpacity style={styles.selectedSpotLabel} onPress={() => setSelectedCategory('all')}>
              <GlassPill active style={styles.spotLabelPill}>
                <Text style={styles.spotLabelText}>
                  {categoryConfig[selectedCategory]?.label || selectedCategory}
                </Text>
                <Text style={styles.spotLabelClear}> ×</Text>
              </GlassPill>
            </TouchableOpacity>
          )}
          <Text style={styles.carTapHint}>Tap on a dot to filter assembly tasks</Text>
        </View>

        {/* Difficulty filter - 3 buttons on one line, Veteran = advanced in data */}
        <View style={styles.difficultyRow}>
          {[
            { key: 'beginner' as const, icon: beginnerIcon, label: 'Beginner' },
            { key: 'intermediate' as const, icon: intermediateIcon, label: 'Intermediate' },
            { key: 'advanced' as const, icon: veteranIcon, label: 'Veteran' },
          ].map(({ key, icon, label }) => {
            const isActive = selectedDifficulty === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSelectedDifficulty(isActive ? 'all' : key)}
                style={[styles.difficultyButton, isActive && styles.difficultyButtonActive]}
              >
                <View style={styles.difficultyIconWrap}>
                  <Image source={icon} style={styles.difficultyIcon} resizeMode="contain" />
                </View>
                <Text style={[styles.difficultyLabel, { color: isActive ? '#FFFFFF' : themeColors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
  logoButton: {
    position: 'absolute',
    top: 60,
    left: spacing.screenPadding,
    zIndex: 10,
  },
  logoImage: {
    width: 100,
    height: 32,
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
  pairSection: {
    marginBottom: 12,
  },
  pairButton: {
    marginBottom: 0,
  },
  pairToAriaTouchable: {
    alignSelf: 'center',
    marginTop: 6,
  },
  pairToAriaText: {
    fontSize: 10,
    color: colors.textTertiary,
    opacity: 0.8,
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
  dakkotaButtonWrapper: {
    width: '100%',
    minHeight: 120,
    position: 'relative',
  },
  dakkotaButtonImage: {
    width: '100%',
    height: 120,
  },
  dakkotaButtonContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: '30%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dakkotaButtonText: {
    color: '#0D0D12',
    fontSize: 16,
    fontWeight: '600',
  },
  dakkotaButtonSubtext: {
    color: 'rgba(13, 13, 18, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  carFilterSection: {
    marginBottom: 16,
    alignItems: 'center',
  },
  carContainer: {
    width: '100%',
    aspectRatio: 656 / 437.33334,
    minHeight: 320,
    position: 'relative',
    marginBottom: 8,
  },
  carImage: {
    width: '100%',
    height: '100%',
  },
  carSpot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 59, 48, 0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 59, 48, 1)',
    marginLeft: -11,
    marginTop: -11,
  },
  carSpotActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderColor: '#FFFFFF',
  },
  selectedSpotLabel: {
    marginBottom: 8,
  },
  spotLabelPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotLabelText: {
    ...typography.caption1,
    color: '#FFFFFF',
  },
  spotLabelClear: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: 2,
  },
  carTapHint: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  difficultyRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  difficultyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    minWidth: 0,
  },
  difficultyButtonActive: {
    backgroundColor: 'rgba(255, 159, 10, 0.25)',
    borderColor: 'rgba(255, 159, 10, 0.5)',
  },
  difficultyIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  difficultyIcon: {
    width: 18,
    height: 18,
  },
  difficultyLabel: {
    fontSize: 12,
    fontWeight: '600',
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
