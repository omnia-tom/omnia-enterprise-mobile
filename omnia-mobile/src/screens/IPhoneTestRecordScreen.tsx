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
  Dimensions,
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
import HandPoseOverlay from '../components/HandPoseOverlay';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Demo hand pose for iPhone prototype (same overlay as glasses — validates UI before hardware test)
const DEMO_HAND_POSE = {
  hands: [{
    chirality: 'right' as const,
    joints: [
      { name: 'wrist', x: 0.5, y: 0.72, confidence: 0.9 },
      { name: 'thumbCMC', x: 0.48, y: 0.68, confidence: 0.9 },
      { name: 'thumbMP', x: 0.46, y: 0.62, confidence: 0.9 },
      { name: 'thumbIP', x: 0.44, y: 0.56, confidence: 0.9 },
      { name: 'thumbTip', x: 0.42, y: 0.50, confidence: 0.9 },
      { name: 'indexMCP', x: 0.52, y: 0.66, confidence: 0.9 },
      { name: 'indexPIP', x: 0.54, y: 0.58, confidence: 0.9 },
      { name: 'indexDIP', x: 0.55, y: 0.50, confidence: 0.9 },
      { name: 'indexTip', x: 0.56, y: 0.42, confidence: 0.9 },
      { name: 'middleMCP', x: 0.54, y: 0.64, confidence: 0.9 },
      { name: 'middlePIP', x: 0.56, y: 0.54, confidence: 0.9 },
      { name: 'middleDIP', x: 0.57, y: 0.46, confidence: 0.9 },
      { name: 'middleTip', x: 0.58, y: 0.38, confidence: 0.9 },
      { name: 'ringMCP', x: 0.52, y: 0.62, confidence: 0.9 },
      { name: 'ringPIP', x: 0.54, y: 0.52, confidence: 0.9 },
      { name: 'ringDIP', x: 0.55, y: 0.44, confidence: 0.9 },
      { name: 'ringTip', x: 0.56, y: 0.36, confidence: 0.9 },
      { name: 'littleMCP', x: 0.50, y: 0.60, confidence: 0.9 },
      { name: 'littlePIP', x: 0.52, y: 0.50, confidence: 0.9 },
      { name: 'littleDIP', x: 0.53, y: 0.42, confidence: 0.9 },
      { name: 'littleTip', x: 0.54, y: 0.34, confidence: 0.9 },
    ],
  }],
  timestamp: Date.now() / 1000,
  frameWidth: SCREEN_W,
  frameHeight: SCREEN_H,
};

let ExpoSpeech: any = null;
try {
  const sr = require('expo-speech-recognition');
  ExpoSpeech = sr.ExpoSpeechRecognitionModule;
} catch {}

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
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [currentInstructionIndex, setCurrentInstructionIndex] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    loadTask();
    (async () => {
      const [cam, mic] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        ExpoSpeech?.requestPermissionsAsync?.().catch(() => ({ granted: false })),
      ]);
      setHasPermission(cam.status === 'granted');
      setMicPermission(mic?.granted ?? false);
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

  const advanceStep = () => {
    if (!task?.instructions?.length) return;
    setCurrentInstructionIndex((prev) =>
      Math.min(prev + 1, task!.instructions!.length - 1)
    );
  };

  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});

  // Voice commands on iPhone (next, repeat, done) — requires mic permission
  useEffect(() => {
    if (!ExpoSpeech || !recording || !micPermission) return;
    const handleResult = (event: { results?: Array<{ transcript?: string }>; isFinal?: boolean }) => {
      const transcript = (event.results?.[0]?.transcript || '').toLowerCase().trim();
      if (transcript.includes('next')) advanceStep();
      if (transcript.includes('repeat')) {
        setCurrentInstructionIndex((p) => Math.max(0, p - 1));
      }
      if (transcript.includes('done') || transcript.includes('stop')) stopRecordingRef.current();
    };
    let listener: { remove: () => void } | null = null;
    (async () => {
      try {
        listener = ExpoSpeech.addListener?.('result', handleResult);
        await ExpoSpeech.start?.({ lang: 'en-US', continuous: true });
      } catch (e) {
        console.warn('[IPhoneTest] Speech recognition:', e);
      }
    })();
    return () => {
      listener?.remove?.();
      ExpoSpeech?.stop?.().catch(() => {});
    };
  }, [recording, micPermission]);

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

  const doStopRecording = async () => {
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
  stopRecordingRef.current = doStopRecording;

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
      stepRecaps: task.instructions.map((inst, i) => ({ stepIndex: i, instruction: inst })),
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
      {/* Demo hand pose overlay — same UI as glasses, for iPhone prototyping */}
      {recording && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 100, pointerEvents: 'none' }]}>
          <HandPoseOverlay
            handPoseData={DEMO_HAND_POSE}
            containerWidth={SCREEN_W}
            containerHeight={SCREEN_H}
          />
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Demo overlay</Text>
          </View>
        </View>
      )}
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.taskTitle}>{task.title}</Text>
        {recording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatTime(elapsed)}</Text>
          </View>
        )}
        <View style={styles.bottomControlArea}>
          {recording && task.instructions?.length > 0 && (
            <View style={styles.instructionOverlay}>
              <Text style={styles.instructionLabel}>
                Step {currentInstructionIndex + 1} of {task.instructions.length}
              </Text>
              <Text style={styles.instructionText}>
                {task.instructions[currentInstructionIndex]}
              </Text>
              <View style={styles.instructionActions}>
                {currentInstructionIndex < task.instructions.length - 1 && (
                  <TouchableOpacity style={styles.nextStepBtn} onPress={advanceStep}>
                    <Text style={styles.nextStepBtnText}>Next →</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.voiceHint}>
                  {micPermission ? 'Say "next" or "done"' : 'Enable mic for voice'}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.handStatus}>
            <View style={[styles.handDot, { backgroundColor: 'rgba(52, 199, 89, 0.9)' }]} />
            <Text style={styles.handText}>Keep hands visible in frame</Text>
          </View>
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
              <TouchableOpacity style={styles.stopBtn} onPress={doStopRecording}>
                <Text style={styles.stopBtnText}>Stop & Save</Text>
              </TouchableOpacity>
            )}
          </View>
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
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { color: '#fff', fontSize: 16 },
  taskTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
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
  bottomControlArea: { alignItems: 'center', gap: 12, width: '100%' },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF453A' },
  recordingTime: { color: '#fff', fontSize: 18, fontWeight: '600' },
  instructionOverlay: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  instructionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  voiceHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
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
  nextStepBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(99, 102, 241, 0.8)',
    borderRadius: 8,
  },
  nextStepBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  demoBadge: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  demoBadgeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
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
