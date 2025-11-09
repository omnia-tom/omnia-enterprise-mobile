import React, { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface NavigationProps {
  isAuthenticated: boolean;
}

export default function Navigation({ isAuthenticated }: NavigationProps) {
  console.log('Navigation received isAuthenticated:', isAuthenticated, typeof isAuthenticated);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    console.log('Navigation useEffect - isAuthenticated:', isAuthenticated, typeof isAuthenticated);
    // Navigate to appropriate screen when auth state changes
    if (navigationRef.current) {
      if (isAuthenticated === true) {
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
