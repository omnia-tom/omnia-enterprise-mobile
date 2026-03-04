/**
 * Dark-themed workstation selection. Replaces full-screen QR scanner.
 * User picks station directly or optionally scans QR in a modal.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MeshBackground from '../components/MeshBackground';
import QRScanner from '../components/QRScanner';
import { colors, typography, spacing } from '../theme';
import { parseWorkstationQR } from '../config/DakkotaConfig';
import { getSopContent, PROCEDURE_TO_TASK } from '../data/sopContent';

const STATIONS: { procedureId: string; stationId: string; label: string }[] = [
  { procedureId: 'FBG', stationId: '001', label: 'Front Bumper & Grille — Station 001' },
  { procedureId: 'FF', stationId: '001', label: 'Front Fascia — Station 001' },
  { procedureId: 'RB', stationId: '001', label: 'Rear Bumper — Station 001' },
  { procedureId: 'FS', stationId: '001', label: 'Front Suspension — Station 001' },
  { procedureId: 'RS', stationId: '001', label: 'Rear Suspension — Station 001' },
  { procedureId: 'OH', stationId: '001', label: 'Overhead Systems — Station 001' },
  { procedureId: 'TW', stationId: '001', label: 'Tire & Wheel — Station 001' },
];

export default function WorkstationSelectScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [scanModalVisible, setScanModalVisible] = useState(false);

  const handleSelectStation = (procedureId: string, stationId: string) => {
    const sopContent = getSopContent(procedureId, stationId);
    const taskId = PROCEDURE_TO_TASK[procedureId];
    if (taskId) {
      (navigation as any).navigate('TaskDetail', {
        taskId,
        sopContent: sopContent ?? undefined,
        procedureId,
        stationId,
      });
    }
  };

  const handleScan = (raw: string | { data?: string; nativeEvent?: { data?: string } }) => {
    const data =
      typeof raw === 'string'
        ? raw
        : (raw?.nativeEvent?.data ?? raw?.data ?? String(raw));
    const parsed = parseWorkstationQR(data);
    if (__DEV__ && !parsed) {
      console.warn('[WorkstationSelect] QR not recognized. Raw:', JSON.stringify(data), 'chars:', [...(data || '')].map((c) => c.charCodeAt(0)));
    }
    if (parsed) {
      const taskId = PROCEDURE_TO_TASK[parsed.procedureId];
      if (!taskId) {
        Alert.alert(
          'Unknown Procedure',
          `Procedure "${parsed.procedureId}" is not configured. Accepted: FBG, FF, RB, FS, RS, OH, TW.`,
          [{ text: 'OK' }]
        );
        return;
      }
      setScanModalVisible(false);
      // Defer navigation so modal fully closes before we navigate (avoids navigation/Modal conflicts)
      const sopContent = getSopContent(parsed.procedureId, parsed.stationId);
      setTimeout(() => {
        (navigation as any).navigate('TaskDetail', {
          taskId,
          sopContent: sopContent ?? undefined,
          procedureId: parsed.procedureId,
          stationId: parsed.stationId,
        });
      }, 150);
    } else {
      Alert.alert(
        'QR Code Not Recognized',
        'Use plain text content: FBG-001\n\nSee QR_CODE_FOR_TESTING.md for exact format.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Select Workstation</Text>
        <Text style={styles.subtitle}>
          Choose your assembly station or scan the QR code.
        </Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {STATIONS.map(({ procedureId, stationId, label }) => (
          <TouchableOpacity
            key={`${procedureId}-${stationId}`}
            style={styles.stationCard}
            onPress={() => handleSelectStation(procedureId, stationId)}
            activeOpacity={0.8}
          >
            <Text style={styles.stationLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => setScanModalVisible(true)}
      >
        <Text style={styles.scanButtonText}>Scan QR Code</Text>
      </TouchableOpacity>

      <Modal
        visible={scanModalVisible}
        animationType="slide"
        onRequestClose={() => setScanModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setScanModalVisible(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Scan Workstation QR</Text>
          </View>
          <View style={styles.scannerWrapper}>
            <QRScanner onScan={handleScan} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.screenPadding,
    paddingBottom: 16,
  },
  title: {
    ...typography.title1,
    marginBottom: 4,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },
  stationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  stationLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  scanButton: {
    position: 'absolute',
    bottom: 32,
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  scanButtonText: {
    ...typography.title2,
    color: colors.accent,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.screenPadding,
    paddingTop: 60,
  },
  modalClose: {
    ...typography.body,
    color: colors.accent,
  },
  modalTitle: {
    ...typography.title2,
    color: colors.textPrimary,
  },
  scannerWrapper: {
    flex: 1,
    minHeight: 400,
  },
});
