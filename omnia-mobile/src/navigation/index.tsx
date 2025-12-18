import React, { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import PairingScreen from '../screens/PairingScreen';
import BLEConnectionScreen from '../screens/BLEConnectionScreen';
import ChatScreen from '../screens/ChatScreen';
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
        navigationRef.current.navigate('Login');
      }
    }
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
