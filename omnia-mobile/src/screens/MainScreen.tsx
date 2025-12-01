import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export default function MainScreen() {
  const navigation = useNavigation();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [userInitials, setUserInitials] = useState<string>('👤');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoadingPhoto(false);
      return;
    }

    // First check Firebase Auth photoURL
    if (user.photoURL) {
      setProfilePhotoUrl(user.photoURL);
      setLoadingPhoto(false);
      return;
    }

    // Then check Firestore user document
    const userDocRef = doc(db, 'users', user.uid);
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(
      userDocRef,
      (userDoc) => {
        const currentUser = auth.currentUser;
        
        // Check Firebase Auth photoURL first (takes priority)
        if (currentUser?.photoURL) {
          setProfilePhotoUrl(currentUser.photoUrl);
        } else if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Check for photoURL in Firestore
          if (userData.photoUrl) {
            setProfilePhotoUrl(userData.photoUrl);
          } else {
            setProfilePhotoUrl(null);
          }
          
          // Set initials from first and last name
          if (userData.firstName && userData.lastName) {
            const initials = `${userData.firstName.charAt(0)}${userData.lastName.charAt(0)}`.toUpperCase();
            setUserInitials(initials);
          } else if (userData.email || currentUser?.email) {
            const email = userData.email || currentUser?.email || '';
            const initials = email.charAt(0).toUpperCase();
            setUserInitials(initials);
          }
        } else {
          // No Firestore document, try to get initials from Auth
          if (currentUser?.email) {
            const initials = currentUser.email.charAt(0).toUpperCase();
            setUserInitials(initials);
          }
        }
        setLoadingPhoto(false);
      },
      (error) => {
        console.error('Error fetching user profile:', error);
        setLoadingPhoto(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handlePairDevice = () => {
    navigation.navigate('Pairing' as never);
  };

  const handleAccountPress = () => {
    navigation.navigate('Account' as never);
  };

  const handleMyDevicesPress = () => {
    navigation.navigate('Devices' as never);
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#E0E7FF', '#EDE9FE']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <StatusBar style="dark" />

      {/* Profile Icon - Top Right */}
      <TouchableOpacity style={styles.profileButton} onPress={handleAccountPress}>
        <View style={styles.profileIcon}>
          {loadingPhoto ? (
            <ActivityIndicator size="small" color="#6366F1" />
          ) : profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={styles.profileImage}
              resizeMode="cover"
              onError={() => {
                // Fallback to initials if image fails to load
                setProfilePhotoUrl(null);
              }}
            />
          ) : (
            <Text style={styles.profileIconText}>{userInitials}</Text>
          )}
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
              colors={['#6366F1', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionGradient}
            >
              <Text style={styles.actionText}>📱 Pair New Device</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleMyDevicesPress} style={styles.actionButtonOutline}>
            <Text style={styles.actionTextOutline}>👓 My Devices</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButtonOutline}>
            <Text style={styles.actionTextOutline}>💬 Chat (Coming Soon)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
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
    color: '#6B7280',
    marginBottom: 4,
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
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
    borderColor: 'rgba(99, 102, 241, 0.4)',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    marginBottom: 12,
  },
  actionTextOutline: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '600',
  },
});
