import React, { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import PairingScreen from '../screens/PairingScreen';
import AccountScreen from '../screens/AccountScreen';
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
        navigationRef.current.navigate('Main');
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
          name="Main"
          component={MainScreen}
        />
        <Stack.Screen
          name="Pairing"
          component={PairingScreen}
        />
        <Stack.Screen
          name="Account"
          component={AccountScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
