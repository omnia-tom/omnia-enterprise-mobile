import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { colors, typography, spacing } from '../theme';
import { RootStackParamList, Task, Submission } from '../types';
import { getTaskById, addSubmission } from '../services/taskData';
import { metaWearablesService, MetaVideoFrame, HandPoseData } from '../services/metaWearables';
import HandPoseOverlay from '../components/HandPoseOverlay';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Recording'>;
type Route = RouteProp<RootStackParamList, 'Recording'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type RecordingPhase = 'preview' | 'instructions' | 'recording' | 'review';

export default function RecordingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId } = route.params;

  const [task, setTask] = useState<Task | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('preview');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [handPoseData, setHandPoseData] = useState<HandPoseData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedVideo, setRecordedVideo] = useState<{ filePath: string; frameCount: number; duration: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instructionFade = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const audioStepRef = useRef(0);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    loadTask();
    startStream();

    return () => {
      stopEverything();
    };
  }, []);

  const loadTask = async () => {
    const data = await getTaskById(taskId);
    setTask(data || null);
  };

  const startStream = async () => {
    try {
      await metaWearablesService.startVideoStream();
      await metaWearablesService.setHandPoseEnabled(true);

      metaWearablesService.addEventListener('videoFrame', handleVideoFrame);
      metaWearablesService.addEventListener('handPoseDetected', handleHandPose);

      // Show instruction overlay briefly
      setTimeout(() => {
        setPhase('instructions');
        Animated.sequence([
          Animated.timing(instructionFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(3000),
          Animated.timing(instructionFade, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(() => {
          setPhase('preview');
        });
      }, 500);
    } catch (e) {
      console.error('[RecordingScreen] Failed to start stream:', e);
    }
  };

  const handleVideoFrame = useCallback((frame: MetaVideoFrame) => {
    setCurrentFrame(frame.data);
  }, []);

  const handleHandPose = useCallback((data: HandPoseData) => {
    setHandPoseData(data);
  }, []);

  const stopEverything = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    metaWearablesService.removeEventListener('videoFrame', handleVideoFrame);
    metaWearablesService.removeEventListener('handPoseDetected', handleHandPose);
    try {
      if (isRecordingRef.current) {
        await metaWearablesService.stopRecording();
        isRecordingRef.current = false;
      }
      await metaWearablesService.setHandPoseEnabled(false);
      await metaWearablesService.stopVideoStream();
    } catch {}
  };

  const startRecording = async () => {
    try {
      await metaWearablesService.startRecording();
      isRecordingRef.current = true;
      setPhase('recording');
      setElapsedSeconds(0);

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

      // Start audio guidance
      startAudioGuidance();
    } catch (e) {
      console.error('[RecordingScreen] Failed to start recording:', e);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const startAudioGuidance = async () => {
    if (!task) return;
    audioStepRef.current = 0;

    for (let i = 0; i < task.instructions.length; i++) {
      if (!isRecordingRef.current) break;
      audioStepRef.current = i;

      try {
        await metaWearablesService.speakInstruction(task.instructions[i]);
      } catch {}

      // Pause between instructions
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);

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
        <StatusBar style="light" />
        <View style={styles.reviewContainer}>
          <View style={styles.reviewThumbnail}>
            {currentFrame && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${currentFrame}` }}
                style={styles.fullFrame}
                resizeMode="cover"
              />
            )}
            <View style={styles.reviewOverlay}>
              <Text style={styles.reviewDuration}>{formatTime(Math.round(recordedVideo.duration))}</Text>
              <Text style={styles.reviewFrames}>{recordedVideo.frameCount} frames</Text>
            </View>
          </View>

          <Text style={styles.reviewTitle}>Recording Complete</Text>
          <Text style={styles.reviewSubtitle}>{task?.title}</Text>

          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.reRecordButton} onPress={handleReRecord}>
              <Text style={styles.reRecordText}>Re-record</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.8}>
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

      {/* Full-screen video */}
      <View style={styles.videoContainer}>
        {currentFrame ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${currentFrame}` }}
            style={styles.fullFrame}
            resizeMode="cover"
          />
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
          <View style={[styles.handDot, { backgroundColor: handsDetected ? colors.success : colors.destructive }]} />
          <Text style={styles.handText}>
            {handsDetected ? 'Hands visible' : 'Hands not detected'}
          </Text>
        </View>

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

  // Instructions overlay
  instructionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 32,
  },
  instructionCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 24,
    maxWidth: 340,
    width: '100%',
  },
  instructionTitle: {
    ...typography.title1,
    marginBottom: 16,
    textAlign: 'center',
  },
  instructionStep: {
    ...typography.body,
    color: colors.textSecondary,
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
    backgroundColor: '#FF3B30',
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
    backgroundColor: '#FF3B30',
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
    backgroundColor: colors.background,
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
    color: colors.textSecondary,
    marginBottom: 32,
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
    borderColor: colors.accent,
    alignItems: 'center',
  },
  reRecordText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
