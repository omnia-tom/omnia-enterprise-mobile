import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';

export default function MainScreen() {
  const navigation = useNavigation();

  const handlePairDevice = () => {
    navigation.navigate('Pairing' as never);
  };

  const handleAccountPress = () => {
    navigation.navigate('Account' as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Profile Icon - Top Right */}
      <TouchableOpacity style={styles.profileButton} onPress={handleAccountPress}>
        <View style={styles.profileIcon}>
          <Text style={styles.profileIconText}>👤</Text>
        </View>
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.appName}>Omnia</Text>
          <Text style={styles.subtitle}>Manage your smart glasses devices</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>

          <TouchableOpacity onPress={handlePairDevice} style={styles.actionButton}>
            <LinearGradient
              colors={['#6E40FF', '#A394FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionGradient}
            >
              <Text style={styles.actionText}>📱 Pair New Device</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButtonOutline}>
            <Text style={styles.actionTextOutline}>👓 My Devices (Coming Soon)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButtonOutline}>
            <Text style={styles.actionTextOutline}>💬 Chat (Coming Soon)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0C46',
  },
  profileButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(107, 77, 255, 0.3)',
    borderWidth: 2,
    borderColor: '#A394FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconText: {
    fontSize: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 80,
  },
  header: {
    marginBottom: 32,
  },
  welcomeText: {
    fontSize: 16,
    color: '#DAD8E6',
    marginBottom: 4,
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#DAD8E6',
  },
  card: {
    backgroundColor: 'rgba(26, 12, 70, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.3)',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#6B4DFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  actionButton: {
    marginBottom: 12,
  },
  actionGradient: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonOutline: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.4)',
    backgroundColor: 'rgba(107, 77, 255, 0.1)',
    marginBottom: 12,
  },
  actionTextOutline: {
    color: '#A394FF',
    fontSize: 16,
    fontWeight: '600',
  },
});
