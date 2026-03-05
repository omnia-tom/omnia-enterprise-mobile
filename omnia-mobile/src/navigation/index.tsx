import React, { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef, CommonActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import PairingScreen from '../screens/PairingScreen';
import BLEConnectionScreen from '../screens/BLEConnectionScreen';
import ChatScreen from '../screens/ChatScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import RecordingScreen from '../screens/RecordingScreen';
import IPhoneTestRecordScreen from '../screens/IPhoneTestRecordScreen';
import MainScreen from '../screens/MainScreen';
import ConsentScreen from '../screens/ConsentScreen';
import WorkstationSelectScreen from '../screens/WorkstationSelectScreen';
import SubmissionDetailScreen from '../screens/SubmissionDetailScreen';
import TabNavigator from './TabNavigator';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface NavigationProps {
  isAuthenticated: boolean;
}

export default function Navigation({ isAuthenticated }: NavigationProps) {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    // Navigate to appropriate screen when auth state changes
    if (navigationRef.current) {
      if (isAuthenticated) {
        navigationRef.current.navigate('MainTabs' as any);
      } else {
        // Reset stack to Login so user can sign in; clears MainTabs/Account/etc.
        navigationRef.current.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          })
        );
      }
    }
  }, [isAuthenticated]);

  // Start on Login when signed out; MainTabs when signed in (avoids brief Login flash for cached users).
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={isAuthenticated ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0D0D12' },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
        />
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator as any}
        />
        <Stack.Screen
          name="TaskDetail"
          component={TaskDetailScreen}
        />
        <Stack.Screen
          name="Recording"
          component={RecordingScreen}
        />
        <Stack.Screen
          name="IPhoneTestRecord"
          component={IPhoneTestRecordScreen}
        />
        <Stack.Screen
          name="Account"
          component={MainScreen}
        />
        <Stack.Screen
          name="Pairing"
          component={PairingScreen}
        />
        <Stack.Screen
          name="BLEConnection"
          component={BLEConnectionScreen}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
        />
        <Stack.Screen
          name="Consent"
          component={ConsentScreen}
        />
        <Stack.Screen
          name="WorkstationSelect"
          component={WorkstationSelectScreen}
        />
        <Stack.Screen
          name="SubmissionDetail"
          component={SubmissionDetailScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
