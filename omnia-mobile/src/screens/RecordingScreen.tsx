import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
  InteractionManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Task, Submission, StepRecap } from '../types';
import { getTaskById, addSubmission } from '../services/taskData';
import { metaWearablesService, MetaVideoFrame, HandPoseData, VoiceCommand, StepValidation, VLMModelInfo } from '../services/metaWearables';
import HandPoseOverlay from '../components/HandPoseOverlay';
import NativeFrameView from '../components/NativeFrameView';
import MeshBackground from '../components/MeshBackground';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Recording'>;
type Route = RouteProp<RootStackParamList, 'Recording'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = ['#30D158', '#FFFFFF', '#5E5CE6', '#FF9F0A', '#64D2FF', '#BF5AF2', '#FF6482'];
const CONFETTI_COUNT = 60;

function ConfettiOverlay() {
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => {
      const size = 5 + Math.random() * 9;
      const isRect = Math.random() > 0.4;
      return {
        x: SCREEN_WIDTH * 0.05 + Math.random() * SCREEN_WIDTH * 0.9,
        width: size,
        height: isRect ? size * (0.4 + Math.random() * 0.3) : size,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        borderRadius: isRect ? 1.5 : size / 2,
        delay: Math.random() * 800,
        duration: 2500 + Math.random() * 2000,
        drift: (Math.random() - 0.5) * 120,
        startRotation: Math.random() * 360,
        endRotation: 360 + Math.random() * 720,
        anim: new Animated.Value(0),
      };
    })
  ).current;

  useEffect(() => {
    pieces.forEach(p => {
      Animated.timing(p.anim, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            transform: [
              {
                translateY: p.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_HEIGHT + 60],
                }),
              },
              {
                translateX: p.anim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0, p.drift * 0.4, p.drift, p.drift * 0.8],
                }),
              },
              {
                rotate: p.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${p.startRotation}deg`, `${p.endRotation}deg`],
                }),
              },
            ],
            opacity: p.anim.interpolate({
              inputRange: [0, 0.1, 0.75, 1],
              outputRange: [0, 1, 1, 0],
            }),
          }}
        />
      ))}
    </View>
  );
}

type RecordingPhase = 'preview' | 'instructions' | 'recording' | 'review';

export default function RecordingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId } = route.params;
  const theme = useThemeColors();
  const { colors } = theme;

  const [task, setTask] = useState<Task | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('preview');
  const [isStreaming, setIsStreaming] = useState(false);
  const [handPoseData, setHandPoseData] = useState<HandPoseData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedVideo, setRecordedVideo] = useState<{ filePath: string; frameCount: number; duration: number } | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [voiceReady, setVoiceReady] = useState(false);
  const [stepValidations, setStepValidations] = useState<boolean[]>([]);
  const [vlmChecking, setVlmChecking] = useState(false);
  const [vlmStatus, setVlmStatus] = useState<{ response: string; prompt: string; validated: boolean } | null>(null);
  const [vlmModelState, setVlmModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [vlmModelError, setVlmModelError] = useState<string | null>(null);
  const [vlmLog, setVlmLog] = useState<Array<{ time: string; msg: string; color?: string }>>([]);
  const [vlmModels, setVlmModels] = useState<VLMModelInfo[]>([]);
  const [vlmCurrentModel, setVlmCurrentModel] = useState<string>('qwen2vl2b');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSwitching, setModelSwitching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addVlmLog = (msg: string, color?: string) => {
    const now = new Date();
    const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setVlmLog(prev => [...prev.slice(-4), { time, msg, color }]);
    setTimeout(() => vlmLogScrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instructionFade = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const audioStepRef = useRef(0);
  const isRecordingRef = useRef(false);
  const voiceActiveRef = useRef(false);
  const waitingForCommandRef = useRef<((cmd: string) => void) | null>(null);
  const stepDotPulse = useRef(new Animated.Value(1)).current;
  const stepValidationsRef = useRef<boolean[]>([]);
  const taskRef = useRef<Task | null>(null);
  const startRecordingRef = useRef<() => void>(() => {});
  const stopRecordingRef = useRef<() => void>(() => {});
  const vlmLogScrollRef = useRef<ScrollView>(null);
  const reviewCheckScale = useRef(new Animated.Value(0)).current;
  const stepRecapsRef = useRef<StepRecap[]>([]);
  const handPoseSamplesRef = useRef<Array<{ timestamp: number; elapsedSec: number; hands: unknown[] }>>([]);
  const handPoseDataRef = useRef<HandPoseData | null>(null);
  const lastHandSampleRef = useRef(0);
  const elapsedSecRef = useRef(0);
  const [videoLayout, setVideoLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  useEffect(() => {
    loadTask();
    startStream();
    preloadModel();

    return () => {
      stopEverything();
    };
  }, []);

  // Animate checkmark when entering review
  useEffect(() => {
    if (phase === 'review') {
      reviewCheckScale.setValue(0);
      Animated.spring(reviewCheckScale, {
        toValue: 1,
        tension: 40,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
  }, [phase]);

  const preloadModel = async () => {
    // Fetch available models
    try {
      const { models, current } = await metaWearablesService.getAvailableVLMModels();
      if (models.length > 0) setVlmModels(models);
      if (current) setVlmCurrentModel(current);
    } catch {}

    setVlmModelState('loading');
    const modelLabel = vlmModels.find(m => m.key === vlmCurrentModel)?.label || 'FastVLM';
    addVlmLog(`Loading ${modelLabel}...`, '#FF9F0A');
    try {
      await metaWearablesService.preloadVLM();
      setVlmModelState('ready');
      addVlmLog(`${modelLabel} loaded OK`, '#30D158');
    } catch (err: any) {
      setVlmModelState('error');
      setVlmModelError(err?.message || 'Unknown error');
      addVlmLog(`Model load FAILED: ${err?.message || err}`, '#FF453A');
    }
  };

  const loadTask = async () => {
    const data = await getTaskById(taskId);
    setTask(data || null);
    taskRef.current = data || null;
  };

  const startStream = async () => {
    try {
      await metaWearablesService.startVideoStream();
      await metaWearablesService.setHandPoseEnabled(true);

      metaWearablesService.addEventListener('videoFrame', handleVideoFrame);
      metaWearablesService.addEventListener('handPoseDetected', handleHandPose);
      metaWearablesService.addEventListener('voiceCommand', handleVoiceCommand);
      metaWearablesService.addEventListener('stepValidation', handleStepValidation);

      // Show instruction overlay briefly
      setTimeout(() => {
        setPhase('instructions');
        Animated.sequence([
          Animated.timing(instructionFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(3000),
          Animated.timing(instructionFade, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(() => {
          setPhase('preview');
          startVoiceListening();
        });
      }, 500);
    } catch (e) {
      console.error('[RecordingScreen] Failed to start stream:', e);
    }
  };

  const startVoiceListening = async () => {
    try {
      await metaWearablesService.speakInstruction("Say 'start' when you're ready to begin recording.");
      await metaWearablesService.startVoiceRecognition();
      voiceActiveRef.current = true;
      setVoiceReady(true);
    } catch {
      // Voice recognition not available — user can still tap to record
      setVoiceReady(false);
    }
  };

  const handleVoiceCommand = useCallback((cmd: VoiceCommand) => {
    // If we're waiting for a specific command during guidance, resolve it
    if (waitingForCommandRef.current) {
      waitingForCommandRef.current(cmd.command);
      return;
    }

    // Handle "start" command during preview — use ref to get latest function
    if (cmd.command === 'start' && !isRecordingRef.current) {
      startRecordingRef.current();
      return;
    }

    // Handle "done" command during recording
    if (cmd.command === 'done' && isRecordingRef.current) {
      stopRecordingRef.current();
    }
  }, []);

  const handleVideoFrame = useCallback((frame: MetaVideoFrame) => {
    setIsStreaming(true);
  }, []);

  const handleHandPose = useCallback((data: HandPoseData) => {
    setHandPoseData(data);
    handPoseDataRef.current = data;
    if (isRecordingRef.current && data.hands?.length) {
      const now = Date.now();
      if (now - lastHandSampleRef.current > 1500) {
        lastHandSampleRef.current = now;
        handPoseSamplesRef.current.push({
          timestamp: data.timestamp * 1000,
          elapsedSec: elapsedSecRef.current,
          hands: data.hands.map((h) => ({
            chirality: h.chirality,
            joints: h.joints.map((j) => ({ name: j.name, x: j.x, y: j.y })),
          })),
        });
      }
    }
  }, []);

  const handleStepValidation = useCallback((data: StepValidation) => {
    setVlmChecking(data.checking);
    if (data.checking && !data.response) {
      addVlmLog('Analyzing image...', '#FF9F0A');
    }
    if (data.response) {
      const isError = data.response.startsWith('ERROR');
      const color = isError ? '#FF453A' : '#30D158';
      addVlmLog(`VLM: ${data.response}`, color);
      setVlmStatus({
        response: data.response,
        prompt: data.prompt || '',
        validated: false,
      });
    }
  }, []);

  const stopEverything = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    waitingForCommandRef.current = null;
    metaWearablesService.removeEventListener('videoFrame', handleVideoFrame);
    metaWearablesService.removeEventListener('handPoseDetected', handleHandPose);
    metaWearablesService.removeEventListener('voiceCommand', handleVoiceCommand);
    metaWearablesService.removeEventListener('stepValidation', handleStepValidation);
    try {
      if (voiceActiveRef.current) {
        await metaWearablesService.stopVoiceRecognition();
        voiceActiveRef.current = false;
      }
      if (isRecordingRef.current) {
        await metaWearablesService.stopRecording();
        isRecordingRef.current = false;
      }
      await metaWearablesService.stopStepValidation().catch(() => {});
      await metaWearablesService.setHandPoseEnabled(false);
      await metaWearablesService.stopVideoStream();
    } catch {}
  };

  const waitForVoiceCommand = (): Promise<string> => {
    return new Promise((resolve) => {
      waitingForCommandRef.current = resolve;
    });
  };

  const startRecording = async () => {
    try {
      await metaWearablesService.startRecording();
      isRecordingRef.current = true;
      setPhase('recording');
      setElapsedSeconds(0);
      setCurrentStep(0);
      addVlmLog(`Recording started. Model: ${vlmModels.find(m => m.key === vlmCurrentModel)?.label || vlmCurrentModel}`);

      // Initialize step validations array
      const validArr = new Array(task?.instructions.length || 0).fill(false);
      setStepValidations(validArr);
      stepValidationsRef.current = validArr;
      stepRecapsRef.current = [];
      handPoseSamplesRef.current = [];
      lastHandSampleRef.current = 0;

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => {
          elapsedSecRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);

      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();

      // Step dot pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(stepDotPulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(stepDotPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();

      // Start audio guidance
      startAudioGuidance();
    } catch (e) {
      console.error('[RecordingScreen] Failed to start recording:', e);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const speakAndResumeVoice = async (text: string) => {
    // Stop voice recognition before TTS to avoid audio session conflicts
    if (voiceActiveRef.current) {
      try { await metaWearablesService.stopVoiceRecognition(); } catch {}
    }

    // Speak
    try {
      await metaWearablesService.speakInstruction(text);
    } catch (err) {
      console.warn('[RecordingScreen] TTS error:', err);
    }

    // Restart voice recognition after TTS finishes
    if (isRecordingRef.current) {
      try {
        await metaWearablesService.startVoiceRecognition();
        voiceActiveRef.current = true;
      } catch (err) {
        console.warn('[RecordingScreen] Voice restart error:', err);
        voiceActiveRef.current = false;
      }
    }
  };

  const startAudioGuidance = async () => {
    if (!task) return;
    audioStepRef.current = 0;

    // Ensure voice recognition is active
    if (!voiceActiveRef.current) {
      try {
        await metaWearablesService.startVoiceRecognition();
        voiceActiveRef.current = true;
      } catch {
        voiceActiveRef.current = false;
      }
    }

    // Speak intro
    await speakAndResumeVoice(
      "We'll guide you through the steps. Say 'next' for the next step, 'repeat' to hear again, or 'done' when complete."
    );

    // Step-by-step with voice commands + continuous VLM
    for (let i = 0; i < task.instructions.length; i++) {
      if (!isRecordingRef.current) break;
      audioStepRef.current = i;
      setCurrentStep(i);

      // Start continuous VLM evaluation for this step
      metaWearablesService.startStepValidation(i, task.instructions[i]).catch((err) => {
        addVlmLog(`VLM setup error: ${err?.message || err}`, '#FF453A');
      });

      await speakAndResumeVoice(task.instructions[i]);

      if (!isRecordingRef.current) break;

      // Wait for voice command OR auto-advance after 10 seconds
      const cmd = await Promise.race([
        waitForVoiceCommand(),
        new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 12000)),
      ]);

      if (cmd === 'repeat') {
        i--; // Re-speak current step
        continue;
      }
      if (cmd === 'done') {
        stopRecording();
        return;
      }
      if (cmd === 'timeout' || cmd === 'next') {
        const hp = handPoseDataRef.current;
        const wrist = hp?.hands?.[0]?.joints?.find((j) => j.name === 'wrist');
        stepRecapsRef.current.push({
          stepIndex: i,
          instruction: task.instructions[i],
          stillImageUri: undefined,
          handPoseSample: hp?.hands?.length
            ? {
                timestamp: hp.timestamp,
                wristPosition: wrist ? { x: wrist.x, y: wrist.y, z: 0 } : undefined,
                hands: hp.hands.map((h) => ({
                  chirality: h.chirality,
                  joints: h.joints.map((j) => ({ name: j.name, x: j.x, y: j.y, z: 0 })),
                })),
              }
            : undefined,
        });
        if (i + 1 < task.instructions.length) {
          addVlmLog(`Step ${i + 1} complete → Next: "${task.instructions[i + 1].substring(0, 45)}"`, '#FFFFFF');
        } else {
          addVlmLog('All steps complete', '#30D158');
        }
      }
    }

    // All steps done — notify
    if (isRecordingRef.current) {
      await speakAndResumeVoice(
        "All steps complete. Say 'done' or tap stop when you're finished."
      );
      setCurrentStep(task.instructions.length);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    stepDotPulse.stopAnimation();
    stepDotPulse.setValue(1);
    waitingForCommandRef.current = null;

    // Stop VLM validation
    metaWearablesService.stopStepValidation().catch(() => {});

    try {
      const result = await metaWearablesService.stopRecording();
      isRecordingRef.current = false;
      const filePath = String(result?.filePath ?? 'unknown');
      const frameCount = Number(result?.frameCount) || 0;
      const duration = Number(result?.duration) || 0;
      // Defer state updates to avoid crash during native→JS transition; ensures smooth transition to review
      InteractionManager.runAfterInteractions(() => {
        setRecordedVideo({ filePath, frameCount, duration });
        setPhase('review');
      });
    } catch (e) {
      console.error('[RecordingScreen] Failed to stop recording:', e);
      isRecordingRef.current = false;
      InteractionManager.runAfterInteractions(() => setPhase('preview'));
    }
  };

  // Keep refs pointing to latest closures so voice commands work
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;

  const handleSwitchModel = async (key: string) => {
    if (key === vlmCurrentModel) {
      setShowModelPicker(false);
      return;
    }
    setShowModelPicker(false);
    setModelSwitching(true);
    setVlmModelState('loading');
    const label = vlmModels.find(m => m.key === key)?.label || key;
    addVlmLog(`Switching to ${label}...`, '#FF9F0A');
    try {
      await metaWearablesService.setVLMModel(key);
      setVlmCurrentModel(key);
      setVlmModelState('ready');
      addVlmLog(`${label} loaded OK`, '#30D158');
    } catch (err: any) {
      setVlmModelState('error');
      setVlmModelError(err?.message || 'Unknown error');
      addVlmLog(`Switch failed: ${err?.message || err}`, '#FF453A');
    }
    setModelSwitching(false);
  };

  const handleSubmit = async () => {
    if (!task || !recordedVideo || submitting) return;
    const user = auth.currentUser;
    if (!user) return;

    setSubmitting(true);
    try {
      const submission: Submission = {
        id: `sub-${Date.now()}`,
        taskId: task.id,
        taskTitle: task.title,
        userId: user.uid,
        status: 'under_review',
        videoFilePath: recordedVideo.filePath,
        duration: recordedVideo.duration,
        frameCount: recordedVideo.frameCount,
        submittedAt: new Date(),
        stepRecaps: stepRecapsRef.current.length ? stepRecapsRef.current : task.instructions.map((inst, i) => ({ stepIndex: i, instruction: inst })),
        handPoseSamples: handPoseSamplesRef.current.length ? handPoseSamplesRef.current : undefined,
      };
      await addSubmission(submission);
      (navigation as any).navigate('MainTabs', { screen: 'Submissions' });
    } catch (err) {
      console.error('[Recording] Submit error:', err);
      Alert.alert('Submit Failed', 'Could not save recording. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReRecord = () => {
    setRecordedVideo(null);
    setElapsedSeconds(0);
    setCurrentStep(-1);
    setStepValidations([]);
    stepValidationsRef.current = [];
    setVlmChecking(false);
    setVlmStatus(null);
    setPhase('preview');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handsDetected = handPoseData && handPoseData.hands.length > 0;
  const minDurationMet = task ? elapsedSeconds >= task.requiredDuration.minSeconds : false;

  // Review / Completion phase
  if (phase === 'review' && recordedVideo) {
    const totalSteps = task?.instructions.length || 0;

    return (
      <View style={styles.container}>
        <StatusBar style={theme.statusBarStyle} />
        <MeshBackground variant="balanced" />
        <ConfettiOverlay />

        <ScrollView
          contentContainerStyle={[
            styles.reviewScroll,
            { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 20) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Animated checkmark */}
          <Animated.View style={[styles.reviewCheckCircle, { transform: [{ scale: reviewCheckScale }] }]}>
            <Text style={styles.reviewCheckMark}>{'✓'}</Text>
          </Animated.View>

          <Text style={styles.rvTitle}>Recording Complete</Text>
          <Text style={styles.rvSubtitle}>{task?.title}</Text>

          {/* Stats row */}
          <View style={styles.rvStatsRow}>
            <View style={styles.rvStat}>
              <Text style={styles.rvStatValue}>{formatTime(Math.round(recordedVideo.duration))}</Text>
              <Text style={styles.rvStatLabel}>Duration</Text>
            </View>
            <View style={styles.rvStatDivider} />
            <View style={styles.rvStat}>
              <Text style={styles.rvStatValue}>{recordedVideo.frameCount.toLocaleString()}</Text>
              <Text style={styles.rvStatLabel}>Frames</Text>
            </View>
            <View style={styles.rvStatDivider} />
            <View style={styles.rvStat}>
              <Text style={styles.rvStatValue}>{totalSteps}/{totalSteps}</Text>
              <Text style={styles.rvStatLabel}>Steps</Text>
            </View>
          </View>

          {/* Steps breakdown card */}
          {task && task.instructions.length > 0 && (
            <View style={styles.rvStepsCard}>
              <Text style={styles.rvStepsTitle}>Steps Completed</Text>
              {task.instructions.map((instruction, i) => (
                <View key={i} style={styles.rvStepRow}>
                  <View style={styles.rvStepCheck}>
                    <Text style={styles.rvStepCheckText}>{'✓'}</Text>
                  </View>
                  <Text style={styles.rvStepText} numberOfLines={2}>{instruction}</Text>
                </View>
              ))}
            </View>
          )}

          {/* VLM model used */}
          {vlmCurrentModel && (
            <View style={styles.rvModelBadge}>
              <View style={styles.rvModelDot} />
              <Text style={styles.rvModelText}>
                Analyzed with {vlmModels.find(m => m.key === vlmCurrentModel)?.label || vlmCurrentModel}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.rvActions}>
            <TouchableOpacity style={styles.rvReRecordButton} onPress={handleReRecord}>
              <Text style={styles.rvReRecordText}>Re-record</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rvSubmitButton, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={styles.rvSubmitText}>{submitting ? 'Submitting...' : 'Submit Recording'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Live stream phases (preview, instructions, recording)
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full-screen video — rendered natively, no bridge traffic */}
      <View
        style={styles.videoContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setVideoLayout({ width, height });
          }
        }}
      >
        {NativeFrameView ? (
          <NativeFrameView style={styles.fullFrame} isActive={true} contentMode="cover" />
        ) : (
          <View style={styles.placeholderFrame}>
            <Text style={styles.placeholderText}>Waiting for video stream...</Text>
          </View>
        )}

        {/* Hand pose overlay — always visible during recording when task requires hand tracking */}
        {phase === 'recording' && task?.handTrackingRequired && (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 100, pointerEvents: 'none' }]}>
            {handPoseData && handPoseData.hands?.length > 0 ? (
              <HandPoseOverlay
                handPoseData={handPoseData}
                containerWidth={videoLayout.width}
                containerHeight={videoLayout.height}
                frameWidth={handPoseData.frameWidth}
                frameHeight={handPoseData.frameHeight}
              />
            ) : (
              <View style={styles.handTrackingStatus}>
                <View style={styles.handTrackingDot} />
                <Text style={styles.handTrackingText}>
                  {handPoseData ? 'Hand tracking active' : 'Waiting for hand tracking...'}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Top overlay — task title at top of iPhone view, always visible */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8), top: 0 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBackButton}>
          <Text style={styles.topBackArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={2}>{task?.title || 'Recording'}</Text>
          {phase === 'recording' && (
            <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>
          )}
        </View>
        <View style={styles.topSpacer} />
      </View>

      {/* VLM + Step info panel (always visible during recording) */}
      {phase === 'recording' && task && (
        <View style={styles.vlmPanel}>
          {/* Model status row — tap model name to switch */}
          <View style={styles.vlmPanelStatusRow}>
            <View style={[
              styles.vlmBadgeDot,
              { backgroundColor:
                vlmModelState === 'ready' ? '#30D158' :
                vlmModelState === 'error' ? '#FF453A' :
                vlmModelState === 'loading' ? '#FF9F0A' :
                '#8E8E93'
              }
            ]} />
            <TouchableOpacity
              onPress={() => setShowModelPicker(!showModelPicker)}
              disabled={modelSwitching}
              style={styles.modelNameButton}
            >
              <Text style={styles.vlmPanelStatusText}>
                {vlmModelState === 'loading'
                  ? `${vlmModels.find(m => m.key === vlmCurrentModel)?.label || 'Model'} loading...`
                  : vlmModelState === 'ready'
                  ? `${vlmModels.find(m => m.key === vlmCurrentModel)?.label || 'FastVLM'} ready`
                  : vlmModelState === 'error'
                  ? `Error: ${vlmModelError}`
                  : 'VLM idle'}
              </Text>
              <Text style={styles.modelSwitchHint}>{showModelPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          </View>

          {/* Model picker dropdown */}
          {showModelPicker && vlmModels.length > 0 && (
            <View style={styles.modelPickerDropdown}>
              {vlmModels.map(model => (
                <TouchableOpacity
                  key={model.key}
                  style={[
                    styles.modelPickerItem,
                    model.key === vlmCurrentModel && styles.modelPickerItemActive,
                  ]}
                  onPress={() => handleSwitchModel(model.key)}
                >
                  <Text style={[
                    styles.modelPickerLabel,
                    model.key === vlmCurrentModel && styles.modelPickerLabelActive,
                  ]}>
                    {model.label}
                  </Text>
                  <Text style={styles.modelPickerSize}>{model.size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step dots */}
          {currentStep >= 0 && (
            <>
              <View style={styles.stepDotsRow}>
                {task.instructions.map((_, i) => {
                  const isPast = i < currentStep;
                  const isCurrent = i === currentStep && currentStep < task.instructions.length;

                  return (
                    <View key={i} style={styles.stepDotWrapper}>
                      {isPast ? (
                        <View style={[styles.stepDot, styles.stepDotValidated]}>
                          <Text style={styles.stepDotCheck}>{'✓'}</Text>
                        </View>
                      ) : isCurrent ? (
                        <Animated.View style={[styles.stepDot, styles.stepDotActive, { opacity: stepDotPulse }]}>
                          <View style={styles.stepDotActiveInner} />
                        </Animated.View>
                      ) : (
                        <View style={[styles.stepDot, styles.stepDotInactive]} />
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={styles.stepDotsLabel} numberOfLines={2}>
                {currentStep < task.instructions.length
                  ? `Step ${currentStep + 1}/${task.instructions.length}: "${task.instructions[currentStep]}"`
                  : 'All steps complete'}
              </Text>
            </>
          )}

          {/* Continuous VLM Log */}
          <View style={styles.vlmLogContainer}>
            <ScrollView ref={vlmLogScrollRef} style={styles.vlmLogScroll} nestedScrollEnabled>
              {vlmLog.length === 0 && (
                <Text style={styles.vlmLogEntry}>VLM analyzing continuously...</Text>
              )}
              {vlmLog.map((entry, idx) => (
                <Text key={idx} style={[styles.vlmLogEntry, entry.color ? { color: entry.color } : undefined]}>
                  {entry.time} {entry.msg}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* VLM model badge (non-recording phases) */}
      {phase !== 'recording' && vlmModelState !== 'idle' && (
        <View style={[
          styles.vlmModelBadge,
          vlmModelState === 'ready' ? styles.vlmBadgeReady :
          vlmModelState === 'error' ? styles.vlmBadgeError :
          styles.vlmBadgeLoading,
        ]}>
          <View style={[
            styles.vlmBadgeDot,
            { backgroundColor:
              vlmModelState === 'ready' ? '#30D158' :
              vlmModelState === 'error' ? '#FF453A' :
              '#FF9F0A'
            }
          ]} />
          <Text style={styles.vlmBadgeText}>
            {vlmModelState === 'loading'
              ? `${vlmModels.find(m => m.key === vlmCurrentModel)?.label || 'Model'} loading...`
              : vlmModelState === 'ready'
              ? `${vlmModels.find(m => m.key === vlmCurrentModel)?.label || 'FastVLM'} ready`
              : `Error: ${vlmModelError}`}
          </Text>
        </View>
      )}

      {/* Instructions overlay (fades in/out) */}
      {phase === 'instructions' && task && (
        <Animated.View style={[styles.instructionOverlay, { opacity: instructionFade }]}>
          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>Instructions</Text>
            {task.instructions.map((step, i) => (
              <Text key={i} style={styles.instructionStep}>{i + 1}. {step}</Text>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Bottom overlay bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Hand detection status */}
        <View style={styles.handStatus}>
          <View style={[styles.handDot, { backgroundColor: handsDetected ? '#34C759' : '#FF3B30' }]} />
          <Text style={styles.handText}>
            {handsDetected ? 'Hands visible' : 'Hands not detected'}
          </Text>
        </View>

        {/* Voice hint during preview */}
        {phase === 'preview' && voiceReady && (
          <Text style={styles.voiceHint}>Say "Start" to begin</Text>
        )}
        {/* Voice hint during recording */}
        {phase === 'recording' && (
          <Text style={styles.voiceHint}>Say "Next" to advance step</Text>
        )}

        {/* Record / Stop button */}
        {phase === 'recording' ? (
          <TouchableOpacity onPress={stopRecording} activeOpacity={0.8}>
            <View style={styles.stopButtonOuter}>
              <View style={styles.stopButtonInner} />
            </View>
            {!minDurationMet && task && (
              <Text style={styles.minDurationHint}>
                Min {Math.ceil(task.requiredDuration.minSeconds / 60)} min
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={startRecording} activeOpacity={0.8}>
            <Animated.View style={[styles.recordButtonOuter, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.recordButtonInner} />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  fullFrame: {
    width: '100%',
    height: '100%',
  },
  placeholderFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
  },
  handTrackingStatus: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  handTrackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  handTrackingText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
  },

  // Top bar — fixed at top of camera FOV, high z-index so it stays visible
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBackButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBackArrow: {
    fontSize: 36,
    fontWeight: '300',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  timer: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  topSpacer: {
    width: 44,
  },

  // Unified VLM + Steps panel (during recording)
  vlmPanel: {
    position: 'absolute',
    bottom: 220,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 12,
    gap: 8,
  },
  vlmPanelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vlmPanelStatusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  modelNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modelSwitchHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    marginLeft: 4,
  },
  modelPickerDropdown: {
    backgroundColor: 'rgba(30,30,40,0.95)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  modelPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modelPickerItemActive: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
  },
  modelPickerLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  modelPickerLabelActive: {
    color: '#30D158',
    fontWeight: '700',
  },
  modelPickerSize: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  vlmResultSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 8,
  },
  vlmOverlayResponseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vlmOverlayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  vlmOverlayResponse: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  vlmOverlayChecking: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  vlmLogContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 8,
    gap: 6,
  },
  checkButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  checkButtonDisabled: {
    opacity: 0.4,
  },
  checkButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  vlmLogScroll: {
    maxHeight: 70,
  },
  vlmLogEntry: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontFamily: 'Courier',
    lineHeight: 14,
  },

  // VLM model badge (preview/instructions phases)
  vlmModelBadge: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  vlmBadgeLoading: {
    backgroundColor: 'rgba(255, 159, 10, 0.25)',
  },
  vlmBadgeReady: {
    backgroundColor: 'rgba(48, 209, 88, 0.25)',
  },
  vlmBadgeError: {
    backgroundColor: 'rgba(255, 69, 58, 0.25)',
  },
  vlmBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  vlmBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Step dots
  stepDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stepDotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotValidated: {
    backgroundColor: '#30D158',
  },
  stepDotCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stepDotActive: {
    backgroundColor: '#FFFFFF',
  },
  stepDotActiveInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  stepDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  stepDotsLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Instructions overlay
  instructionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 32,
  },
  instructionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 24,
    maxWidth: 340,
    width: '100%',
  },
  instructionTitle: {
    ...typography.title1,
    color: '#F2F2F7',
    marginBottom: 16,
    textAlign: 'center',
  },
  instructionStep: {
    ...typography.body,
    color: '#98989D',
    marginBottom: 10,
    lineHeight: 22,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  handStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  handDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  handText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  voiceHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Record button
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF453A',
  },

  // Stop button
  stopButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stopButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FF453A',
  },
  minDurationHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },

  // Review / Completion
  reviewScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  reviewCheckCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#30D158',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#30D158',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  reviewCheckMark: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '700',
    marginTop: -2,
  },
  rvTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0F0F5',
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  rvSubtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 28,
    textAlign: 'center',
  },
  rvStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 24,
    width: '100%',
  },
  rvStat: {
    flex: 1,
    alignItems: 'center',
  },
  rvStatValue: {
    color: '#F0F0F5',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rvStatLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rvStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rvStepsCard: {
    width: '100%',
    backgroundColor: '#1C1C23',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  rvStepsTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  rvStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  rvStepCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(48, 209, 88, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  rvStepCheckText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '700',
  },
  rvStepText: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 21,
  },
  rvModelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 28,
  },
  rvModelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5E5CE6',
    marginRight: 8,
  },
  rvModelText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
  },
  rvActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  rvReRecordButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
  },
  rvReRecordText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  rvSubmitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  rvSubmitText: {
    color: '#09090F',
    fontSize: 17,
    fontWeight: '600',
  },
});
