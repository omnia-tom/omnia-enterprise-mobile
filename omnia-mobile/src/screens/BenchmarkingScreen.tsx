import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { spacing } from '../theme';
import {
  metaWearablesService,
  MetaVideoFrame,
  MetaDevice,
  MetaConnectionStatus,
  HandPoseData,
  BenchmarkTestTick,
  BenchmarkTestComplete,
  SystemState,
  BenchmarkFile,
  BENCHMARK_SCENARIOS,
} from '../services/metaWearables';
import HandPoseOverlay from '../components/HandPoseOverlay';
import NativeFrameView from '../components/NativeFrameView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = Dimensions.get('window').height * 0.35;

type ConnectionPhase = 'checking' | 'disconnected' | 'discovering' | 'connecting' | 'starting_stream' | 'connected';

const THERMAL_COLORS: Record<string, string> = {
  nominal: '#30D158',
  fair: '#FF9F0A',
  serious: '#FF6B35',
  critical: '#FF453A',
  unknown: 'rgba(255,255,255,0.4)',
};

export default function BenchmarkingScreen() {
  const insets = useSafeAreaInsets();

  // Connection state
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('checking');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<MetaDevice[]>([]);

  // Stream state
  const [isStreaming, setIsStreaming] = useState(false);

  // Hand tracking state
  const [handPoseData, setHandPoseData] = useState<HandPoseData | null>(null);

  // System state (polled)
  const [systemState, setSystemState] = useState<SystemState | null>(null);

  // Benchmark state
  const [runningScenarioId, setRunningScenarioId] = useState<number | null>(null);
  const [tickData, setTickData] = useState<BenchmarkTestTick | null>(null);
  const [completedTests, setCompletedTests] = useState<Map<number, BenchmarkTestComplete>>(new Map());

  // Saved files
  const [savedFiles, setSavedFiles] = useState<BenchmarkFile[]>([]);

  const streamStartedRef = useRef(false);
  const autoConnectAttemptedRef = useRef(false);
  const systemStatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Event handlers ────────────────────────────────────────────

  const handleVideoFrame = useCallback((_frame: MetaVideoFrame) => {
    setIsStreaming(true);
    setConnectionPhase(prev => prev === 'starting_stream' ? 'connected' : prev);
  }, []);

  const handleHandPose = useCallback((data: HandPoseData) => {
    setHandPoseData(data);
  }, []);

  const handleTick = useCallback((data: BenchmarkTestTick) => {
    setTickData(data);
  }, []);

  const handleTestComplete = useCallback((data: BenchmarkTestComplete) => {
    setCompletedTests(prev => {
      const next = new Map(prev);
      next.set(data.scenarioId, data);
      return next;
    });
    setRunningScenarioId(null);
    setTickData(null);
    // Refresh file list
    metaWearablesService.listBenchmarkFiles().then(setSavedFiles).catch(() => {});
  }, []);

  // ── Stream lifecycle ──────────────────────────────────────────

  const startStream = async () => {
    setConnectionPhase('starting_stream');
    setConnectionMessage('Starting video stream...');
    try {
      await metaWearablesService.startVideoStream();
      await metaWearablesService.setHandPoseEnabled(true);
      streamStartedRef.current = true;
    } catch (e: any) {
      console.error('[BenchmarkingScreen] Failed to start stream:', e);
      setConnectionPhase('disconnected');
      setConnectionMessage(e?.message || 'Failed to start video stream. Tap Connect to retry.');
    }
  };

  const connectToDevice = async (device: MetaDevice) => {
    setConnectionPhase('connecting');
    setConnectionMessage(`Connecting to ${device.name}...`);
    try {
      await metaWearablesService.connectToDevice(device.id);
    } catch (e: any) {
      console.error('[BenchmarkingScreen] Connect error:', e);
      setConnectionPhase('discovering');
      setConnectionMessage(e?.message || 'Connection failed');
    }
  };

  // ── System state polling ────────────────────────────────────────

  const startSystemStatePolling = useCallback(() => {
    if (systemStatePollRef.current) return;
    const poll = setInterval(() => {
      metaWearablesService.getSystemState().then(setSystemState).catch(() => {});
    }, 2000);
    systemStatePollRef.current = poll;
    // Initial poll
    metaWearablesService.getSystemState().then(setSystemState).catch(() => {});
  }, []);

  const stopSystemStatePolling = useCallback(() => {
    if (systemStatePollRef.current) {
      clearInterval(systemStatePollRef.current);
      systemStatePollRef.current = null;
    }
  }, []);

  // ── Focus effect ──────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      autoConnectAttemptedRef.current = false;

      const handleDeviceFound = (device: MetaDevice) => {
        setDiscoveredDevices(prev => {
          if (prev.find(d => d.id === device.id)) return prev;
          if (!autoConnectAttemptedRef.current && prev.length === 0) {
            autoConnectAttemptedRef.current = true;
            setTimeout(() => connectToDevice(device), 300);
          }
          return [...prev, device];
        });
      };

      const handleDeviceConnected = (_device: MetaDevice) => {
        if (cancelled) return;
        setConnectionMessage('Device connected. Starting stream...');
        setTimeout(() => {
          if (!cancelled) startStream();
        }, 1000);
      };

      // Register listeners
      metaWearablesService.addEventListener('videoFrame', handleVideoFrame);
      metaWearablesService.addEventListener('handPoseDetected', handleHandPose);
      metaWearablesService.addEventListener('benchmarkTestTick', handleTick);
      metaWearablesService.addEventListener('benchmarkTestComplete', handleTestComplete);
      metaWearablesService.addEventListener('deviceFound', handleDeviceFound);
      metaWearablesService.addEventListener('deviceConnected', handleDeviceConnected);

      const init = async () => {
        setConnectionPhase('checking');
        setConnectionMessage(null);
        setDiscoveredDevices([]);

        try {
          await metaWearablesService.initializeSDK();
          if (cancelled) return;

          const status: MetaConnectionStatus = await metaWearablesService.getConnectionStatus();
          if (cancelled) return;

          if (status.isConnected) {
            await startStream();
          } else {
            setConnectionPhase('disconnected');
            if (status.registrationState === 'unavailable') {
              setConnectionMessage('Glasses offline. Make sure they are powered on and nearby.');
            }
          }
        } catch (e: any) {
          console.error('[BenchmarkingScreen] Init error:', e);
          if (!cancelled) {
            setConnectionPhase('disconnected');
            setConnectionMessage(e?.message || 'SDK initialization failed');
          }
        }
      };

      init();
      startSystemStatePolling();
      metaWearablesService.listBenchmarkFiles().then(setSavedFiles).catch(() => {});

      return () => {
        cancelled = true;
        metaWearablesService.removeEventListener('videoFrame', handleVideoFrame);
        metaWearablesService.removeEventListener('handPoseDetected', handleHandPose);
        metaWearablesService.removeEventListener('benchmarkTestTick', handleTick);
        metaWearablesService.removeEventListener('benchmarkTestComplete', handleTestComplete);
        metaWearablesService.removeEventListener('deviceFound', handleDeviceFound);
        metaWearablesService.removeEventListener('deviceConnected', handleDeviceConnected);

        stopSystemStatePolling();

        if (streamStartedRef.current) {
          metaWearablesService.setHandPoseEnabled(false).catch(() => {});
          metaWearablesService.stopVideoStream().catch(() => {});
          streamStartedRef.current = false;
        }
        setIsStreaming(false);
        setHandPoseData(null);
      };
    }, [handleVideoFrame, handleHandPose, handleTick, handleTestComplete, startSystemStatePolling, stopSystemStatePolling])
  );

  // ── Benchmark controls ────────────────────────────────────────

  const startTest = async (scenarioId: number) => {
    if (runningScenarioId !== null) return;
    setRunningScenarioId(scenarioId);
    setTickData(null);
    try {
      await metaWearablesService.startIndividualBenchmark(scenarioId, 60);
    } catch (e: any) {
      console.error('[BenchmarkingScreen] Benchmark start error:', e);
      setRunningScenarioId(null);
      Alert.alert('Error', e?.message || 'Failed to start benchmark');
    }
  };

  const stopTest = async () => {
    try {
      await metaWearablesService.stopIndividualBenchmark();
    } catch {}
    setRunningScenarioId(null);
    setTickData(null);
  };

  // ── File actions ────────────────────────────────────────────

  const handleShareFile = async (path: string) => {
    try {
      await metaWearablesService.shareBenchmarkFile(path);
    } catch (e) {
      console.error('[BenchmarkingScreen] Share error:', e);
    }
  };

  const handleDeleteFile = async (path: string) => {
    Alert.alert('Delete File', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await metaWearablesService.deleteBenchmarkFile(path);
            const files = await metaWearablesService.listBenchmarkFiles();
            setSavedFiles(files);
          } catch (e) {
            console.error('[BenchmarkingScreen] Delete error:', e);
          }
        },
      },
    ]);
  };

  const handleConnect = async () => {
    setConnectionPhase('discovering');
    setConnectionMessage('Searching for glasses...');
    setDiscoveredDevices([]);
    autoConnectAttemptedRef.current = false;
    try {
      await metaWearablesService.startPairing('');
    } catch (e: any) {
      console.error('[BenchmarkingScreen] Pairing error:', e);
      if (e?.message?.includes('NOT_REGISTERED')) {
        setConnectionMessage('Not registered. Complete pairing in the Meta AI app.');
      } else {
        setConnectionPhase('disconnected');
        setConnectionMessage(e?.message || 'Connection failed');
      }
    }
  };

  // ── Computed hand stats ───────────────────────────────────────

  const handsCount = handPoseData?.hands.length ?? 0;
  const totalJoints = handPoseData?.hands.reduce((sum, h) => sum + h.joints.length, 0) ?? 0;
  const avgConfidence =
    handsCount > 0
      ? handPoseData!.hands.reduce(
          (sum, h) => sum + h.joints.reduce((s, j) => s + j.confidence, 0) / (h.joints.length || 1),
          0
        ) / handsCount
      : 0;

  const thermalColor = THERMAL_COLORS[systemState?.thermalState ?? 'unknown'];

  // ── Not connected UI ──────────────────────────────────────────

  if (connectionPhase !== 'connected') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={[styles.videoContainer, { marginTop: insets.top }]}>
          <View style={styles.placeholderFrame}>
            <Text style={styles.placeholderTitle}>
              {connectionPhase === 'checking'
                ? 'Checking connection...'
                : connectionPhase === 'connecting'
                ? 'Connecting...'
                : connectionPhase === 'discovering'
                ? 'Searching for glasses...'
                : connectionPhase === 'starting_stream'
                ? 'Starting stream...'
                : 'Meta Glasses Required'}
            </Text>
            <Text style={styles.placeholderSubtitle}>
              {connectionPhase === 'disconnected'
                ? 'Connect your Meta Ray-Ban glasses to stream video and run benchmarks'
                : connectionPhase === 'discovering'
                ? 'Looking for nearby Meta Ray-Ban glasses'
                : ''}
            </Text>
          </View>
        </View>

        {connectionMessage && (
          <View style={styles.messageBanner}>
            <Text style={styles.messageText}>{connectionMessage}</Text>
          </View>
        )}

        <ScrollView style={styles.connectScrollArea} contentContainerStyle={{ paddingBottom: 120 }}>
          {connectionPhase === 'checking' && (
            <View style={styles.spinnerArea}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
          )}

          {connectionPhase === 'disconnected' && (
            <View style={styles.connectSection}>
              <TouchableOpacity style={styles.connectButton} onPress={handleConnect} activeOpacity={0.8}>
                <Text style={styles.connectButtonText}>Connect Glasses</Text>
              </TouchableOpacity>
              <Text style={styles.connectHint}>
                Make sure your Meta Ray-Ban glasses are powered on and the Meta AI app is installed
              </Text>
            </View>
          )}

          {connectionPhase === 'discovering' && (
            <View style={styles.connectSection}>
              <View style={styles.discoveringRow}>
                <ActivityIndicator color="#FF9F0A" size="small" style={{ marginRight: 12 }} />
                <Text style={styles.discoveringText}>Scanning for devices...</Text>
              </View>
              {discoveredDevices.length > 0 && (
                <View style={styles.deviceList}>
                  <Text style={styles.deviceListTitle}>Found Devices</Text>
                  {discoveredDevices.map(device => (
                    <TouchableOpacity
                      key={device.id}
                      style={styles.deviceRow}
                      onPress={() => connectToDevice(device)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                        <Text style={styles.deviceId}>{device.id}</Text>
                      </View>
                      <Text style={styles.deviceConnectArrow}>{'›'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {(connectionPhase === 'connecting' || connectionPhase === 'starting_stream') && (
            <View style={styles.spinnerArea}>
              <ActivityIndicator color="#FF9F0A" size="large" />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Connected: Live video + Benchmark UI ──────────────────────

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* System Status Bar */}
      <View style={[styles.systemStatusBar, { marginTop: insets.top }]}>
        <View style={[styles.thermalPill, { backgroundColor: `${thermalColor}20` }]}>
          <View style={[styles.thermalDot, { backgroundColor: thermalColor }]} />
          <Text style={[styles.thermalText, { color: thermalColor }]}>
            {systemState?.thermalState ?? '...'}
          </Text>
        </View>
        <Text style={styles.systemStatText}>
          {systemState && systemState.batteryLevel >= 0
            ? `${Math.round(systemState.batteryLevel * 100)}%`
            : '—'} Battery
        </Text>
        <Text style={styles.systemStatText}>
          {systemState ? `${systemState.memoryMB.toFixed(0)} MB` : '—'}
        </Text>
      </View>

      {/* Video + Hand Overlay */}
      <View style={styles.videoContainer}>
        {NativeFrameView ? (
          <NativeFrameView style={styles.videoFrame} isActive={true} contentMode="cover" />
        ) : (
          <View style={styles.placeholderFrame}>
            <Text style={styles.placeholderSubtitle}>Waiting for video stream...</Text>
          </View>
        )}

        {handPoseData && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <HandPoseOverlay
              handPoseData={handPoseData}
              containerWidth={SCREEN_WIDTH - spacing.screenPadding * 2}
              containerHeight={VIDEO_HEIGHT}
            />
          </View>
        )}

        <View style={[styles.streamPill, { backgroundColor: isStreaming ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)' }]}>
          <View style={[styles.streamDot, { backgroundColor: isStreaming ? '#30D158' : '#FF453A' }]} />
          <Text style={styles.streamPillText}>{isStreaming ? 'Live' : 'Starting...'}</Text>
        </View>
      </View>

      {/* Live Hand Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{handsCount}</Text>
          <Text style={styles.statLabel}>Hands</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalJoints}</Text>
          <Text style={styles.statLabel}>Joints</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{(avgConfidence * 100).toFixed(0)}%</Text>
          <Text style={styles.statLabel}>Confidence</Text>
        </View>
      </View>

      {/* Main ScrollView */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Configurations */}
        <Text style={styles.sectionTitle}>Test Configurations</Text>

        {BENCHMARK_SCENARIOS.map((scenario) => {
          const isRunning = runningScenarioId === scenario.id;
          const completed = completedTests.get(scenario.id);
          const isDisabled = runningScenarioId !== null && !isRunning;

          return (
            <View
              key={scenario.id}
              style={[
                styles.scenarioCard,
                isRunning && styles.scenarioCardRunning,
                completed && !isRunning && styles.scenarioCardCompleted,
              ]}
            >
              {/* Header Row */}
              <View style={styles.scenarioHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scenarioLabel}>{scenario.label}</Text>
                  <Text style={styles.scenarioSublabel}>
                    {scenario.computeUnit} · {scenario.inputFormat} · {scenario.maxHands}H
                  </Text>
                </View>

                {isRunning ? (
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={stopTest}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.stopButtonText}>Stop</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.runButton, isDisabled && styles.runButtonDisabled]}
                    onPress={() => startTest(scenario.id)}
                    activeOpacity={0.8}
                    disabled={isDisabled || !isStreaming}
                  >
                    <Text style={[styles.runButtonText, isDisabled && styles.runButtonTextDisabled]}>
                      {completed ? 'Re-run' : 'Run'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Running: Live Tick Stats */}
              {isRunning && tickData && (
                <View style={styles.tickStats}>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min((tickData.elapsed / tickData.total) * 100, 100)}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.tickRow}>
                    <Text style={styles.tickText}>{tickData.elapsed}s / {tickData.total}s</Text>
                    <Text style={styles.tickText}>{tickData.frameCount} frames</Text>
                  </View>
                  <View style={styles.tickRow}>
                    <Text style={styles.tickText}>Avg: {tickData.avgInferenceMs.toFixed(1)}ms</Text>
                    <Text style={styles.tickText}>E2E: {tickData.avgE2eMs.toFixed(1)}ms</Text>
                    <Text style={[styles.tickText, { color: THERMAL_COLORS[tickData.thermalState] || '#FFF' }]}>
                      {tickData.thermalState}
                    </Text>
                  </View>
                </View>
              )}

              {/* Completed: Summary */}
              {completed && !isRunning && (
                <View style={styles.completedStats}>
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Completed</Text>
                  </View>
                  <View style={styles.resultMetrics}>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{completed.framesProcessed}</Text>
                      <Text style={styles.resultMetricLabel}>Frames</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{completed.avgInferenceMs.toFixed(1)}</Text>
                      <Text style={styles.resultMetricLabel}>Avg ms</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{completed.p95InferenceMs.toFixed(1)}</Text>
                      <Text style={styles.resultMetricLabel}>p95 ms</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{completed.throughputFps.toFixed(1)}</Text>
                      <Text style={styles.resultMetricLabel}>FPS</Text>
                    </View>
                  </View>
                  <View style={styles.resultMetrics}>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{(completed.avgConfidence * 100).toFixed(0)}%</Text>
                      <Text style={styles.resultMetricLabel}>Conf</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>{completed.avgJitterPx.toFixed(1)}</Text>
                      <Text style={styles.resultMetricLabel}>Jitter px</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>
                        {completed.thermalStart} → {completed.thermalEnd}
                      </Text>
                      <Text style={styles.resultMetricLabel}>Thermal</Text>
                    </View>
                    <View style={styles.resultMetric}>
                      <Text style={styles.resultMetricValue}>
                        {Math.round(completed.batteryStart * 100)}→{Math.round(completed.batteryEnd * 100)}%
                      </Text>
                      <Text style={styles.resultMetricLabel}>Battery</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Saved Files */}
        {savedFiles.length > 0 && (
          <View style={styles.filesSection}>
            <Text style={styles.sectionTitle}>Saved Files</Text>
            {savedFiles.map((file) => (
              <View key={file.path} style={styles.fileRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileMeta}>{file.date} · {file.sizeKB} KB</Text>
                </View>
                <TouchableOpacity
                  style={styles.fileButton}
                  onPress={() => handleShareFile(file.path)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.fileButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.fileButton, styles.fileButtonDelete]}
                  onPress={() => handleDeleteFile(file.path)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fileButtonText, styles.fileButtonDeleteText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* VLM Benchmark Placeholder */}
        <View style={styles.vlmPlaceholder}>
          <Text style={styles.sectionTitle}>VLM Benchmark</Text>
          <Text style={styles.vlmText}>Coming Soon — Visual Language Model benchmarks for step validation accuracy and latency.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D12',
  },

  // System status bar
  systemStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.screenPadding,
    marginBottom: 8,
    gap: 12,
  },
  thermalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  thermalDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  thermalText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  systemStatText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Video area
  videoContainer: {
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    borderRadius: 16,
    marginHorizontal: spacing.screenPadding,
    overflow: 'hidden',
  },
  videoFrame: {
    width: '100%',
    height: '100%',
  },
  placeholderFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    color: '#F0F0F5',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Stream pill
  streamPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  streamDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  streamPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Connection UI
  messageBanner: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 12,
    backgroundColor: 'rgba(255, 159, 10, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageText: {
    color: '#FF9F0A',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  connectScrollArea: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  spinnerArea: {
    paddingTop: 40,
    alignItems: 'center',
  },
  connectSection: {
    paddingTop: 24,
  },
  connectButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#09090F',
    fontSize: 17,
    fontWeight: '600',
  },
  connectHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },

  // Discovering
  discoveringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  discoveringText: {
    color: '#FF9F0A',
    fontSize: 15,
    fontWeight: '600',
  },
  deviceList: {
    gap: 8,
  },
  deviceListTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C23',
    borderRadius: 12,
    padding: 16,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#F0F0F5',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  deviceId: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontFamily: 'Courier',
  },
  deviceConnectArrow: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 28,
    fontWeight: '300',
    marginLeft: 12,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.screenPadding,
    marginTop: 8,
    backgroundColor: '#1C1C23',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#F0F0F5',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Scroll area
  scrollArea: {
    flex: 1,
    marginTop: 12,
    paddingHorizontal: spacing.screenPadding,
  },

  // Section title
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },

  // Scenario cards
  scenarioCard: {
    backgroundColor: '#1C1C23',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  scenarioCardRunning: {
    borderColor: '#FF9F0A',
    borderWidth: 1.5,
  },
  scenarioCardCompleted: {
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scenarioLabel: {
    color: '#F0F0F5',
    fontSize: 14,
    fontWeight: '600',
  },
  scenarioSublabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 2,
  },

  // Run / Stop buttons
  runButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  runButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  runButtonText: {
    color: '#09090F',
    fontSize: 13,
    fontWeight: '700',
  },
  runButtonTextDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
  stopButton: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  stopButtonText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '700',
  },

  // Tick stats (running)
  tickStats: {
    marginTop: 12,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF9F0A',
    borderRadius: 2,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tickText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Completed stats
  completedStats: {
    marginTop: 10,
  },
  completedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  completedBadgeText: {
    color: '#30D158',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  resultMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  resultMetric: {
    alignItems: 'center',
    flex: 1,
  },
  resultMetricValue: {
    color: '#F0F0F5',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  resultMetricLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Saved files
  filesSection: {
    marginTop: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C23',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  fileName: {
    color: '#F0F0F5',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Courier',
  },
  fileMeta: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 2,
  },
  fileButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fileButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  fileButtonDelete: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  fileButtonDeleteText: {
    color: '#FF453A',
  },

  // VLM placeholder
  vlmPlaceholder: {
    marginTop: 8,
    backgroundColor: '#1C1C23',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  vlmText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    lineHeight: 18,
  },
});
