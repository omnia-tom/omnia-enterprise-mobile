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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { typography, spacing, useThemeColors } from '../theme';
import { RootStackParamList, Task, Submission } from '../types';
import { getTaskById, addSubmission } from '../services/taskData';
import { metaWearablesService, MetaVideoFrame, HandPoseData, VoiceCommand, StepValidation } from '../services/metaWearables';
import HandPoseOverlay from '../components/HandPoseOverlay';
import NativeFrameView from '../components/NativeFrameView';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Recording'>;
type Route = RouteProp<RootStackParamList, 'Recording'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  const addVlmLog = (msg: string, color?: string) => {
    const now = new Date();
    const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setVlmLog(prev => [...prev.slice(-19), { time, msg, color }]);
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

  useEffect(() => {
    loadTask();
    startStream();
    preloadModel();

    return () => {
      stopEverything();
    };
  }, []);

  const preloadModel = async () => {
    setVlmModelState('loading');
    addVlmLog('Loading FastVLM model...', '#FF9F0A');
    try {
      await metaWearablesService.preloadVLM();
      setVlmModelState('ready');
      addVlmLog('FastVLM model loaded OK', '#30D158');
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
  }, []);

  const handleStepValidation = useCallback((data: StepValidation) => {
    setVlmChecking(data.checking);
    if (data.checking && !data.response) {
      addVlmLog(`Step ${data.stepIndex}: analyzing frame...`, '#FF9F0A');
    }
    if (data.response) {
      const isYes = data.response.toUpperCase().includes('YES');
      const color = data.response.startsWith('ERROR') ? '#FF453A' : data.validated ? '#30D158' : isYes ? '#FF9F0A' : '#8E8E93';
      addVlmLog(`Step ${data.stepIndex}: "${data.response}" ${data.validated ? '(VALIDATED)' : ''}`, color);
    }
    if (data.response || data.prompt) {
      setVlmStatus({
        response: data.response || '...',
        prompt: data.prompt || '',
        validated: data.validated,
      });
    }
    if (data.validated) {
      setStepValidations(prev => {
        const next = [...prev];
        next[data.stepIndex] = true;
        stepValidationsRef.current = next;
        return next;
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
      addVlmLog(`Recording started. Model: ${vlmModelState}`);

      // Initialize step validations array
      const validArr = new Array(task?.instructions.length || 0).fill(false);
      setStepValidations(validArr);
      stepValidationsRef.current = validArr;

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
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

    // Step-by-step with voice commands + VLM validation
    for (let i = 0; i < task.instructions.length; i++) {
      if (!isRecordingRef.current) break;
      audioStepRef.current = i;
      setCurrentStep(i);

      // Start VLM validation for this step
      addVlmLog(`Starting validation for step ${i}: "${task.instructions[i].substring(0, 40)}..."`);
      metaWearablesService.startStepValidation(i, task.instructions[i]).then(() => {
        addVlmLog(`Step ${i} validation started OK`, '#30D158');
      }).catch((err) => {
        console.warn('[RecordingScreen] VLM startStepValidation error:', err);
        addVlmLog(`Step ${i} validation FAILED: ${err?.message || err}`, '#FF453A');
        setVlmStatus({ response: `ERROR: ${err?.message || err}`, prompt: task.instructions[i], validated: false });
      });

      await speakAndResumeVoice(task.instructions[i]);

      if (!isRecordingRef.current) break;

      // Wait for voice command or auto-advance after 8s
      const cmd = await Promise.race([
        waitForVoiceCommand(),
        new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 8000)),
      ]);

      if (cmd === 'repeat') {
        i--; // Re-speak current step
        continue;
      }
      if (cmd === 'done') {
        stopRecording();
        return;
      }
      // 'next' or 'timeout' → proceed to next step
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
      setRecordedVideo({
        filePath: result.filePath,
        frameCount: result.frameCount,
        duration: result.duration,
      });
      setPhase('review');
    } catch (e) {
      console.error('[RecordingScreen] Failed to stop recording:', e);
      isRecordingRef.current = false;
      setPhase('preview');
    }
  };

  // Keep refs pointing to latest closures so voice commands work
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;

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
      frameCount: recordedVideo.frameCount,
      payoutCents: task.payoutCents,
      submittedAt: new Date(),
    };

    await addSubmission(submission);
    navigation.goBack();
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

  // Review phase
  if (phase === 'review' && recordedVideo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={theme.statusBarStyle} />
        <View style={[styles.reviewContainer, { backgroundColor: colors.background }]}>
          <View style={styles.reviewThumbnail}>
            <View style={styles.reviewOverlay}>
              <Text style={styles.reviewDuration}>{formatTime(Math.round(recordedVideo.duration))}</Text>
              <Text style={styles.reviewFrames}>{recordedVideo.frameCount} frames</Text>
            </View>
          </View>

          <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>Recording Complete</Text>
          <Text style={[styles.reviewSubtitle, { color: colors.textSecondary }]}>{task?.title}</Text>
          {stepValidations.length > 0 && (
            <Text style={[styles.reviewValidation, { color: colors.textSecondary }]}>
              {stepValidations.filter(Boolean).length}/{stepValidations.length} steps verified
            </Text>
          )}

          <View style={styles.reviewActions}>
            <TouchableOpacity style={[styles.reRecordButton, { borderColor: colors.accent }]} onPress={handleReRecord}>
              <Text style={[styles.reRecordText, { color: colors.accent }]}>Re-record</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.accent }]} onPress={handleSubmit} activeOpacity={0.8}>
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Live stream phases (preview, instructions, recording)
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full-screen video — rendered natively, no bridge traffic */}
      <View style={styles.videoContainer}>
        {NativeFrameView ? (
          <NativeFrameView style={styles.fullFrame} isActive={true} contentMode="cover" />
        ) : (
          <View style={styles.placeholderFrame}>
            <Text style={styles.placeholderText}>Waiting for video stream...</Text>
          </View>
        )}

        {/* Hand pose overlay */}
        {handPoseData && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <HandPoseOverlay
              handPoseData={handPoseData}
              containerWidth={SCREEN_WIDTH}
              containerHeight={SCREEN_HEIGHT}
            />
          </View>
        )}
      </View>

      {/* Top overlay bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBackButton}>
          <Text style={styles.topBackArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={1}>{task?.title || 'Recording'}</Text>
          {phase === 'recording' && (
            <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>
          )}
        </View>
        <View style={styles.topSpacer} />
      </View>

      {/* VLM + Step info panel (always visible during recording) */}
      {phase === 'recording' && task && (
        <View style={styles.vlmPanel}>
          {/* Model status row */}
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
            <Text style={styles.vlmPanelStatusText}>
              {vlmModelState === 'loading' ? 'FastVLM loading...' :
               vlmModelState === 'ready' ? 'FastVLM ready' :
               vlmModelState === 'error' ? `Model error: ${vlmModelError}` :
               'FastVLM idle'}
            </Text>
          </View>

          {/* Step dots */}
          {currentStep >= 0 && (
            <>
              <View style={styles.stepDotsRow}>
                {task.instructions.map((_, i) => {
                  const isValidated = stepValidations[i];
                  const isCurrent = i === currentStep && currentStep < task.instructions.length;

                  return (
                    <View key={i} style={styles.stepDotWrapper}>
                      {isValidated ? (
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

          {/* VLM Debug Log */}
          <View style={styles.vlmLogContainer}>
            <Text style={styles.vlmLogTitle}>VLM Log</Text>
            <ScrollView ref={vlmLogScrollRef} style={styles.vlmLogScroll} nestedScrollEnabled>
              {vlmLog.length === 0 && (
                <Text style={styles.vlmLogEntry}>No VLM events yet...</Text>
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
            {vlmModelState === 'loading' ? 'FastVLM loading...' :
             vlmModelState === 'ready' ? 'FastVLM ready' :
             `FastVLM error: ${vlmModelError}`}
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

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    fontSize: 17,
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
    top: 110,
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
    maxHeight: 120,
  },
  vlmLogTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  vlmLogScroll: {
    maxHeight: 100,
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

  // Review
  reviewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screenPadding,
  },
  reviewThumbnail: {
    width: 280,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#000',
  },
  reviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reviewDuration: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  reviewFrames: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 4,
  },
  reviewTitle: {
    ...typography.title1,
    marginBottom: 4,
  },
  reviewSubtitle: {
    ...typography.callout,
    marginBottom: 8,
  },
  reviewValidation: {
    ...typography.caption1,
    marginBottom: 24,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 16,
  },
  reRecordButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  reRecordText: {
    fontSize: 17,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#09090F',
    fontSize: 17,
    fontWeight: '600',
  },
});
