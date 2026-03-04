import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import QRScanner from '../components/QRScanner';
import MeshBackground from '../components/MeshBackground';
import { colors, typography, spacing } from '../theme';
import { parseWorkstationQR } from '../config/DakkotaConfig';
import { getSopContent, PROCEDURE_TO_TASK } from '../data/sopContent';

export default function WorkstationScanScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleScan = (raw: string | { data?: string }) => {
    const data = typeof raw === 'string' ? raw : (raw?.data ?? String(raw));
    const parsed = parseWorkstationQR(data);
    if (parsed) {
      setLastScan(data);
      Alert.alert(
        'Workstation Identified',
        `Station: ${parsed.stationId}\nProcedure: ${parsed.procedureId}\n\nAssembly instructions will be delivered via your glasses.`,
        [
          { text: 'Start Assembly', onPress: () => handleStartAssembly(parsed) },
          { text: 'Scan Again', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        'Invalid QR Code',
        'Accepted formats: DAKKOTA-FBG-001, DAK-SOP-FBG-001, or FBG-001',
        [{ text: 'OK' }]
      );
    }
  };

  const handleStartAssembly = (parsed: { stationId: string; procedureId: string }) => {
    const sopContent = getSopContent(parsed.procedureId, parsed.stationId);
    const taskId = PROCEDURE_TO_TASK[parsed.procedureId] ?? null;

    if (taskId) {
      (navigation as any).navigate('TaskDetail', {
        taskId,
        sopContent: sopContent ?? undefined,
        procedureId: parsed.procedureId,
        stationId: parsed.stationId,
      });
    } else {
      Alert.alert(
        'Assembly Mode',
        sopContent
          ? 'No linked task for this procedure. SOP content will be shown when task linking is configured.'
          : 'Procedure not yet configured. Add SOP content for testing.',
        [{ text: 'OK', onPress: () => (navigation as any).navigate('MainTabs') }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Scan Workstation QR</Text>
        <Text style={styles.subtitle}>
          Scan the QR code at your assembly station to load procedure instructions.
        </Text>
      </View>
      <View style={styles.scannerContainer}>
        <QRScanner onScan={handleScan} />
      </View>
      {lastScan && (
        <Text style={styles.lastScan}>Last scan: {lastScan}</Text>
      )}
      <TouchableOpacity
        style={styles.testButton}
        onPress={() => handleScan('DAKKOTA-FBG-001')}
      >
        <Text style={styles.testButtonText}>Simulate scan: DAKKOTA-FBG-001</Text>
      </TouchableOpacity>
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
    paddingBottom: 8,
  },
  title: {
    ...typography.title1,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.callout,
  },
  scannerContainer: {
    flex: 1,
    minHeight: 300,
  },
  lastScan: {
    ...typography.caption2,
    padding: spacing.screenPadding,
    color: colors.textTertiary,
  },
  testButton: {
    margin: spacing.screenPadding,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  testButtonText: {
    ...typography.caption1,
    color: colors.textSecondary,
  },
});
