import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TaskBrowserScreen from '../screens/TaskBrowserScreen';
import SubmissionsScreen from '../screens/SubmissionsScreen';
import GlassTabBar from '../components/GlassTabBar';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Tasks"
        component={TaskBrowserScreen}
        options={{
          tabBarLabel: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon="🎯" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Submissions"
        component={SubmissionsScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon="📋" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  return (
    <Text style={{ fontSize: size, opacity: color === colors.accent ? 1 : 0.6 }}>
      {icon}
    </Text>
  );
}
