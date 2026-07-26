import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeProvider } from '../context/ThemeContext';
import IntroScreen from '../screens/IntroScreen';
import SignupScreen from '../screens/SignupScreen';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import HomeScreen from '../screens/HomeScreen';
import RoversScreen from '../screens/RoversScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AddDeviceScreen from '../screens/AddDeviceScreen';
import ControlScreen from '../screens/ControlScreen';
import CameraScreen from '../screens/CameraScreen';
import ClustersScreen from '../screens/ClustersScreen';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type RootStackParamList = {
  Intro: undefined;
  Signup: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  VerifyEmail: undefined;
  MainTabs: undefined;
  AddDevice: undefined;
  Control: { deviceId: string; deviceName: string; macAddress: string };
  Camera: { deviceName: string; ip: string };
  Clusters: undefined;
};

export type TabParamList = {
  Home: undefined;
  Rovers: undefined;
  Profile: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  const { theme, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const landscape = winW > 600;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? 'rgba(11,15,28,0.96)' : 'rgba(255,248,240,0.96)',
          borderTopWidth: 0,
          height: landscape ? 58 : 66,
          paddingBottom: landscape ? 6 : 10,
          paddingTop: 8,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          position: 'absolute',
          bottom: 0,
          left: 8,
          right: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: landscape ? 9 : 10, fontWeight: '600', letterSpacing: 0.2 },
        tabBarItemStyle: { gap: 1, paddingVertical: 2 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Rovers"
        component={RoversScreen}
        options={{
          tabBarLabel: 'Rovers',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="robot-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: 'fade',
        }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Intro" component={IntroScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="AddDevice" component={AddDeviceScreen} />
            <Stack.Screen name="Control" component={ControlScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Clusters" component={ClustersScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
