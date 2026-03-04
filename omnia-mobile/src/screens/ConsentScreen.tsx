import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, typography, spacing } from '../theme';
import { metaWearablesService } from '../services/metaWearables';
import { DAKKOTA_CONFIG } from '../config/DakkotaConfig';

export default function ConsentScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<'idle' | 'prompting' | 'listening' | 'accepted' | 'declined' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const voiceListenerRef = useRef<((cmd: { command: string }) => void) | null>(null);

  useEffect(() => {
    if (!DAKKOTA_CONFIG.enabled) {
      navigation.goBack();
      return;
    }

    const startConsentFlow = async () => {
      setStatus('prompting');

      try {
        // Play consent prompt via glasses (hands-free)
        const consentPrompt =
          'Do you consent to data collection for training and quality improvement? Say yes or no.';
        await metaWearablesService.speakInstruction(consentPrompt);
        setStatus('listening');

        // Start voice recognition
        await metaWearablesService.startVoiceRecognition();
      } catch (err: any) {
        console.error('[ConsentScreen] Error starting consent flow:', err);
        setErrorMessage(err?.message || 'Failed to start consent flow');
        setStatus('error');
      }
    };

    voiceListenerRef.current = (event: { command: string }) => {
      if (event.command === 'yes') {
        setStatus('accepted');
        metaWearablesService.stopVoiceRecognition?.();
        // Navigate to workstation scan
        (navigation as any).replace('WorkstationSelect');
      } else if (event.command === 'no') {
        setStatus('declined');
        metaWearablesService.stopVoiceRecognition?.();
        Alert.alert(
          'Consent Declined',
          'You have declined data collection. You can start assembly mode again when ready.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    };

    metaWearablesService.addEventListener('voiceCommand', voiceListenerRef.current);
    startConsentFlow();

    return () => {
      if (voiceListenerRef.current) {
        metaWearablesService.removeEventListener('voiceCommand', voiceListenerRef.current);
      }
      metaWearablesService.stopVoiceRecognition?.().catch(() => {});
    };
  }, [navigation]);

  const getStatusText = () => {
    switch (status) {
      case 'prompting':
        return 'Playing consent prompt…';
      case 'listening':
        return 'Listening for your response. Say yes or no.';
      case 'accepted':
        return 'Consent recorded. Selecting workstation…';
      case 'declined':
        return 'Consent declined.';
      case 'error':
        return errorMessage || 'Something went wrong.';
      default:
        return 'Preparing consent flow…';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.card}>
        <Text style={styles.title}>Dakkota Assembly — Consent</Text>
        <Text style={styles.subtitle}>
          At the start of each workday, we ask for your consent to collect motion and instruction data for training and quality improvement.
        </Text>

        <View style={styles.statusContainer}>
          {status === 'listening' && <ActivityIndicator size="large" color={colors.accent} />}
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {status === 'error' && (
          <>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryButton, { marginTop: 8 }]}
              onPress={() => (navigation as any).replace('WorkstationSelect')}
            >
              <Text style={styles.retryButtonText}>Skip to Workstation Scan (testing)</Text>
            </TouchableOpacity>
          </>
        )}

        {(status === 'idle' || status === 'prompting' || status === 'listening') && (
          <Text style={styles.hint}>Keep your glasses on. Respond with your voice.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.screenPadding,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.cardPadding,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    ...typography.title1,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.callout,
    marginBottom: 24,
  },
  statusContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  statusText: {
    ...typography.body,
    textAlign: 'center',
  },
  hint: {
    ...typography.caption1,
    marginTop: 16,
    textAlign: 'center',
    color: colors.textTertiary,
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    ...typography.title2,
    color: colors.accent,
  },
});
