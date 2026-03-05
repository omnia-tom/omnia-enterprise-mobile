/**
 * Test recording using iPhone camera (no glasses required).
 * Uses native hand pose tracking for real-time overlay (replaces static demo).
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
  Alert,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Task, Submission, StepRecap } from '../types';
import { getTaskById, addSubmission } from '../services/taskData';
import MeshBackground from '../components/MeshBackground';
import HandPoseOverlay from '../components/HandPoseOverlay';
import iPhoneCameraView, { isiPhoneCameraViewAvailable } from '../components/iPhoneCameraView';
import { iphoneCamera, iPhoneHandPoseData } from '../services/iphoneCamera';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Use native camera + hand tracking when available. Enabled now that iPhoneCameraView is registered for Fabric interop.
const NATIVE_HAND_TRACKING_ENABLED = true;
const useNativeHandTracking =
  NATIVE_HAND_TRACKING_ENABLED && iphoneCamera.isAvailable() && isiPhoneCameraViewAvailable();

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
  const [submitting, setSubmitting] = useState(false);
  const [handPoseData, setHandPoseData] = useState<iPhoneHandPoseData | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const elapsedRef = useRef(0);
  const stepRecapsRef = useRef<StepRecap[]>([]);

  useEffect(() => {
    loadTask();
    (async () => {
      const micReq = ExpoSpeech?.requestPermissionsAsync?.();
      const micPromise = micReq && typeof micReq.catch === 'function' ? micReq.catch(() => ({ granted: false })) : Promise.resolve({ granted: false });
      const [cam, mic] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        micPromise,
      ]);
      setHasPermission(cam.status === 'granted');
      setMicPermission(mic?.granted ?? false);
    })();
  }, []);

  // Real-time hand pose from native iPhone camera (replaces static demo)
  useEffect(() => {
    if (!useNativeHandTracking) return;
    const remove = iphoneCamera.addHandPoseListener(setHandPoseData);
    return () => { remove?.(); setHandPoseData(null); };
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
    const prev = currentInstructionIndex;
    const recap: StepRecap = handPoseData?.hands?.length
      ? {
          stepIndex: prev,
          instruction: task!.instructions[prev],
          handPoseSample: (() => {
            const wrist = handPoseData!.hands[0].joints.find((j) => j.name === 'wrist');
            return {
              timestamp: handPoseData!.timestamp,
              wristPosition: wrist ? { x: wrist.x, y: wrist.y, z: (wrist as any).z ?? 0 } : undefined,
              hands: handPoseData!.hands.map((h) => ({
                chirality: h.chirality,
                joints: h.joints.map((j) => ({
                  name: j.name,
                  x: j.x,
                  y: j.y,
                  z: (j as any).z ?? 0,
                })),
              })),
            };
          })(),
        }
      : { stepIndex: prev, instruction: task!.instructions[prev] };

    // One recording per step: replace any existing recap for this step
    const recaps = stepRecapsRef.current.filter((r) => r.stepIndex !== prev);
    recaps.push(recap);
    recaps.sort((a, b) => a.stepIndex - b.stepIndex);
    stepRecapsRef.current = recaps;
    setCurrentInstructionIndex((p) =>
      Math.min(p + 1, task!.instructions!.length - 1)
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
      const stopPromise = ExpoSpeech?.stop?.();
      if (stopPromise && typeof stopPromise.catch === 'function') {
        stopPromise.catch(() => {});
      }
    };
  }, [recording, micPermission]);

  const loadTask = async () => {
    const data = await getTaskById(taskId);
    setTask(data || null);
    setLoading(false);
  };

  const startRecording = async () => {
    if (useNativeHandTracking) {
      stepRecapsRef.current = [];
      setRecording(true);
      setElapsed(0);
      setCurrentInstructionIndex(0);
      try {
        await iphoneCamera.startRecording();
      } catch (e) {
        console.error('[IPhoneTest] Native start record error:', e);
        setRecording(false);
      }
      return;
    }
    if (!cameraRef.current || !cameraReady) return;
    setRecording(true);
    setElapsed(0);
    setCurrentInstructionIndex(0);
    stepRecapsRef.current = [];
    try {
      recordPromiseRef.current = cameraRef.current.recordAsync();
    } catch (e) {
      console.error('[IPhoneTest] Start record error:', e);
      setRecording(false);
    }
  };

  const doStopRecording = async () => {
    const finalElapsed = elapsedRef.current;
    if (useNativeHandTracking) {
      try {
        const result = await iphoneCamera.stopRecording();
        setRecordedVideo({ filePath: result.filePath, duration: result.duration || finalElapsed });
      } catch (e) {
        console.error('[IPhoneTest] Native stop record error:', e);
        setRecordedVideo({ filePath: 'iphone-test-recording', duration: finalElapsed });
      }
      setRecording(false);
      return;
    }
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
    if (!task || !recordedVideo || submitting) return;
    const user = auth.currentUser;
    if (!user) return;

    setSubmitting(true);
    try {
      const stepRecaps =
        stepRecapsRef.current.length > 0
          ? stepRecapsRef.current
          : task.instructions.map((inst, i) => ({ stepIndex: i, instruction: inst }));
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
        stepRecaps,
      };
      await addSubmission(submission);
      navigation.navigate('MainTabs' as any, { screen: 'Submissions' });
    } catch (err) {
      console.error('[IPhoneTest] Submit error:', err);
      Alert.alert('Submit Failed', 'Could not save recording. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.accent }, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>{submitting ? 'Submitting...' : 'Submit to History'}</Text>
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
      {useNativeHandTracking ? (
        <iPhoneCameraView style={StyleSheet.absoluteFill} isActive={hasPermission !== false} />
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
          onCameraReady={() => setCameraReady(true)}
        />
      )}
      {/* Real-time hand pose overlay — tracks actual hand position */}
      {(recording || handPoseData) && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 100, pointerEvents: 'none' }]}>
          {handPoseData && handPoseData.hands?.length > 0 ? (
            <HandPoseOverlay
              handPoseData={handPoseData as any}
              containerWidth={SCREEN_W}
              containerHeight={SCREEN_H}
              frameWidth={handPoseData.frameWidth}
              frameHeight={handPoseData.frameHeight}
            />
          ) : (
            <View style={[styles.handStatus, { position: 'absolute', top: 80, alignSelf: 'center' }]}>
              <View style={[styles.handDot, { backgroundColor: 'rgba(52, 199, 89, 0.9)' }]} />
              <Text style={styles.handText}>
                {handPoseData ? 'Hand tracking active' : 'Show hands in frame'}
              </Text>
            </View>
          )}
        </View>
      )}
      {/* Top bar — task title at very top of camera view */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
        </View>
        <View style={styles.topBarSpacer} />
      </View>
      <View style={[styles.overlay, { paddingTop: 0, paddingBottom: insets.bottom + 24, justifyContent: 'flex-end' }]}>
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
              style={[styles.recordBtn, (!cameraReady && !useNativeHandTracking) && styles.recordBtnDisabled]}
              onPress={startRecording}
              disabled={!useNativeHandTracking && !cameraReady}
            >
              <Text style={styles.recordBtnText}>
                {(useNativeHandTracking || cameraReady) ? 'Start Recording' : 'Preparing...'}
              </Text>
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
    paddingHorizontal: spacing.screenPadding,
    pointerEvents: 'box-none',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 12,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBarCenter: { flex: 1, marginHorizontal: 12, justifyContent: 'center', minHeight: 0 },
  topBarSpacer: { width: 60 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { color: '#fff', fontSize: 16 },
  taskTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
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
