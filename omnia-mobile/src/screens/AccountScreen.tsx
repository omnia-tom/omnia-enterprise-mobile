import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

interface UserData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
}

interface Organization {
  name: string;
  subdomain: string;
}

export default function AccountScreen() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Fetch user document by UID
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);

          // Fetch organization if organizationId exists
          if (data.organizationId) {
            const orgDocRef = doc(db, 'organizations', data.organizationId);
            const orgDoc = await getDoc(orgDocRef);

            if (orgDoc.exists()) {
              const orgData = orgDoc.data();
              setOrganization({
                name: orgData.name,
                subdomain: orgData.subdomain,
              });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Account</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#A394FF" />
          </View>
        ) : (
          <>
            {/* User Info Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personal Information</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>
                  {userData?.firstName} {userData?.lastName}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{userData?.email}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Role:</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>
                    {userData?.role?.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Organization Info Card */}
            {organization && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Organization</Text>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <Text style={styles.infoValue}>{organization.name}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Subdomain:</Text>
                  <Text style={styles.infoValue}>{organization.subdomain}</Text>
                </View>
              </View>
            )}

            {/* Sign Out Button */}
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0C46',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#A394FF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DAD8E6',
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  roleBadge: {
    backgroundColor: 'rgba(107, 77, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  roleText: {
    fontSize: 12,
    color: '#A394FF',
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  signOutText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
  },
});
