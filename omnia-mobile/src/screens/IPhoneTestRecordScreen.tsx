/**
 * Test recording using iPhone camera (no glasses required).
 * For demos when Meta glasses aren't available.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Task, Submission } from '../types';
import { getTaskById, addSubmission } from '../services/taskData';
import MeshBackground from '../components/MeshBackground';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IPhoneTestRecord'>;
type Route = RouteProp<RootStackParamList, 'IPhoneTestRecord'>;

export default function IPhoneTestRecordScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId } = route.params;
  const theme = useThemeColors();
  const { colors } = theme;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<{ filePath: string; duration: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [currentInstructionIndex, setCurrentInstructionIndex] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    loadTask();
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  // Cycle through instructions every ~18 seconds during recording (like glasses audio prompts)
  useEffect(() => {
    if (!recording || !task?.instructions?.length) return;
    const intervalSec = 18;
    const idx = Math.min(Math.floor(elapsed / intervalSec), task.instructions.length - 1);
    setCurrentInstructionIndex(idx);
  }, [recording, elapsed, task?.instructions]);

  const loadTask = async () => {
    const data = await getTaskById(taskId);
    setTask(data || null);
    setLoading(false);
  };

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady) return;
    setRecording(true);
    setElapsed(0);
    setCurrentInstructionIndex(0);
    try {
      recordPromiseRef.current = cameraRef.current.recordAsync();
    } catch (e) {
      console.error('[IPhoneTest] Start record error:', e);
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    const finalElapsed = elapsedRef.current;
    try {
      await cameraRef.current?.stopRecording();
      const result = await recordPromiseRef.current;
      if (result?.uri) {
        setRecordedVideo({ filePath: result.uri, duration: finalElapsed });
      } else {
        setRecordedVideo({ filePath: 'iphone-test-recording', duration: finalElapsed });
      }
    } catch (e) {
      console.error('[IPhoneTest] Stop record error:', e);
      setRecordedVideo({ filePath: 'iphone-test-recording', duration: finalElapsed });
    } finally {
      setRecording(false);
    }
  };

  const handleSubmit = async () => {
    if (!task || !recordedVideo) return;
    const user = auth.currentUser;
    if (!user) return;

    const submission: Submission = {
      id: `sub-${Date.now()}`,
      taskId: task.id,
      taskTitle: task.title,
      userId: user.uid,
      status: 'under_review',
      videoFilePath: recordedVideo.filePath,
      duration: recordedVideo.duration,
      frameCount: 0,
      submittedAt: new Date(),
      payoutCents: task.payoutCents ?? 0,
    };
    await addSubmission(submission);
    navigation.navigate('MainTabs' as any, { screen: 'Submissions' });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading || !task) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <MeshBackground variant="cool" />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (recordedVideo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <MeshBackground variant="balanced" />
        <StatusBar style={theme.statusBarStyle} />
        <ScrollView contentContainerStyle={[styles.reviewContent, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>Recording Complete</Text>
          <Text style={[styles.reviewSubtitle, { color: colors.textSecondary }]}>{task.title}</Text>
          <Text style={[styles.reviewDuration, { color: colors.textTertiary }]}>
            Duration: {formatTime(recordedVideo.duration)}
          </Text>
          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.accent }]} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>Submit to History</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, styles.center]}>
        <MeshBackground variant="cool" />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MeshBackground variant="cool" />
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        onCameraReady={() => setCameraReady(true)}
      />
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.taskLabel}>{task.title}</Text>
        {recording && (
          <View style={styles.recordingHUD}>
            <View style={styles.recordingBadge}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatTime(elapsed)}</Text>
            </View>
            {task.instructions?.length > 0 && (
              <View style={styles.instructionOverlay}>
                <Text style={styles.instructionLabel}>
                  Step {currentInstructionIndex + 1} of {task.instructions.length}
                </Text>
                <Text style={styles.instructionText}>
                  {task.instructions[currentInstructionIndex]}
                </Text>
              </View>
            )}
            <View style={styles.handStatus}>
              <View style={[styles.handDot, { backgroundColor: 'rgba(52, 199, 89, 0.9)' }]} />
              <Text style={styles.handText}>iPhone demo — keep hands visible</Text>
            </View>
          </View>
        )}
        <View style={styles.controls}>
          {!recording ? (
            <TouchableOpacity
              style={[styles.recordBtn, !cameraReady && styles.recordBtnDisabled]}
              onPress={startRecording}
              disabled={!cameraReady}
            >
              <Text style={styles.recordBtnText}>{cameraReady ? 'Start Recording' : 'Preparing...'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
              <Text style={styles.stopBtnText}>Stop & Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  center: { alignItems: 'center', justifyContent: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
  },
  backBtn: { alignSelf: 'flex-start' },
  backText: { color: '#fff', fontSize: 16 },
  taskLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 18, fontWeight: '600' },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  recordingHUD: { alignItems: 'center', gap: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF453A' },
  recordingTime: { color: '#fff', fontSize: 18, fontWeight: '600' },
  instructionOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
    marginHorizontal: spacing.screenPadding,
  },
  instructionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  instructionText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  handStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  handText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  controls: { alignItems: 'center' },
  recordBtn: {
    backgroundColor: '#FF453A',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  recordBtnDisabled: { opacity: 0.6 },
  recordBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  stopBtn: {
    backgroundColor: '#30D158',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  stopBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  reviewContent: { padding: 24, paddingTop: 60 },
  reviewTitle: { ...typography.title1, marginBottom: 8 },
  reviewSubtitle: { ...typography.body, marginBottom: 24 },
  reviewDuration: { ...typography.callout, marginBottom: 32 },
  submitBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#09090F', fontSize: 17, fontWeight: '600' },
  errorText: { fontSize: 16 },
});
