import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../services/firebase';
import { LoginFormData } from '../types';
import { colors } from '../theme';
import GlassCard from '../components/GlassCard';
import MeshBackground from '../components/MeshBackground';

const SAVED_EMAIL_KEY = '@omnia_login_email';

const dakkotaLogo = require('../assets/dakkota-logo.png');
const omniaLogoWhite = require('../assets/omnia-logo-white.png');

export default function LoginScreen() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_EMAIL_KEY).then((email) => {
      if (email) setFormData((f) => ({ ...f, email }));
    });
  }, []);

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    await AsyncStorage.setItem(SAVED_EMAIL_KEY, formData.email.trim());
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, formData.email.trim(), formData.password);
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'An error occurred during login';
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password';
          break;
        case 'auth/invalid-credential':
          errorMessage = 'Invalid email or password';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        default:
          errorMessage = error.message || 'Failed to login';
      }
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      const webClientId = process.env.GOOGLE_WEB_CLIENT_ID;
      if (!webClientId || webClientId === 'your_web_client_id') {
        Alert.alert('Setup Required', 'Google Sign-In is not configured. Add GOOGLE_WEB_CLIENT_ID to your .env file.');
        return;
      }
      GoogleSignin.configure({ webClientId, offlineAccess: true });
      setGoogleLoading(true);
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success' || !response.data?.idToken) {
        setGoogleLoading(false);
        return; // user cancelled
      }
      const credential = GoogleAuthProvider.credential(response.data.idToken);
      await signInWithCredential(auth, credential);
    } catch (error: unknown) {
      setGoogleLoading(false);
      const msg = error instanceof Error ? error.message : 'Google Sign-In failed';
      Alert.alert('Sign-In Failed', msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <MeshBackground variant="warm" />
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Dakkota Logo at top */}
          <View style={styles.dakkotaHeader}>
            <Image source={dakkotaLogo} style={styles.dakkotaLogo} resizeMode="contain" />
          </View>

          <View style={styles.content}>
            {/* Login Card */}
            <GlassCard style={styles.card}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.description}>
                Sign in to get started
              </Text>

              {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="email@company.com"
                placeholderTextColor={colors.textTertiary}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={colors.textTertiary}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                editable={!loading}
              />
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading || googleLoading}
              style={styles.buttonContainer}
            >
              <View style={[styles.button, (loading || googleLoading) && styles.buttonDisabled]}>
                {loading ? (
                  <ActivityIndicator color="#09090F" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Google Sign-In */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              style={styles.googleButtonContainer}
            >
              <View style={[styles.googleButton, (loading || googleLoading) && styles.buttonDisabled]}>
                {googleLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.googleButtonText}>Sign in with Google</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Help Text */}
            <Text style={styles.helpText}>
              Use the same credentials as the web portal
            </Text>
          </GlassCard>
        </View>

          {/* Powered by Omnia - bottom center */}
          <View style={styles.omniaFooter}>
            <Text style={styles.poweredBy}>powered by</Text>
            <Image source={omniaLogoWhite} style={styles.omniaLogo} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 32,
  },
  dakkotaHeader: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 24,
  },
  dakkotaLogo: {
    width: 200,
    height: 48,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  omniaFooter: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
  },
  poweredBy: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'lowercase',
  },
  omniaLogo: {
    width: 80,
    height: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#09090F',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 8,
    fontWeight: '600',
  },
  card: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 12,
  },
  googleButtonContainer: {
    marginBottom: 16,
  },
  googleButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#09090F',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
