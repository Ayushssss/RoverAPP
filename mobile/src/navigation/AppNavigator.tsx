import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../components/Toast';
import NetworkBanner from '../components/NetworkBanner';
import { checkVersion } from '../services/version';
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
import RoverHubScreen from '../screens/RoverHubScreen';
import SensorsScreen from '../screens/SensorsScreen';
import DisplayScreen from '../screens/DisplayScreen';
import CameraScreen from '../screens/CameraScreen';
import ClustersScreen from '../screens/ClustersScreen';
import { ActivityIndicator, View, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type RootStackParamList = {
  Intro: undefined;
  Signup: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  VerifyEmail: undefined;
  MainTabs: undefined;
  AddDevice: undefined;
  RoverHub: { deviceName: string; macAddress: string };
  Control: { deviceId: string; deviceName: string; macAddress: string };
  Sensors: { deviceName: string; macAddress: string };
  Display: { deviceName: string; macAddress: string };
  /** `ip` is the LAN address when known; the relay works without it. */
  Camera: { deviceName: string; macAddress: string; ip?: string };
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
  const insets = useSafeAreaInsets();
  const landscape = winW > 600;
  const barHeight = (landscape ? 54 : 60) + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // Real frosted glass, per DESIGN.md §4 — the bar samples the content
        // scrolling beneath it instead of sitting on a flat translucent fill.
        tabBarBackground: () => (
          <View style={{ flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }}>
            <BlurView
              intensity={isDark ? 65 : 80}
              tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
              // Android's dimezis renderer requires a `blurTarget` ref; without
              // one it falls back to 'none' and warns every render. Asked for
              // explicitly so Android leans on the fill instead.
              blurMethod="none"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {/* Light on iOS so the blur shows through; heavier on Android where
                there is no blur to show. */}
            <View
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: isDark
                  ? `rgba(11,15,28,${Platform.OS === 'ios' ? 0.22 : 0.72})`
                  : `rgba(255,248,240,${Platform.OS === 'ios' ? 0.28 : 0.82})`,
              }}
            />
            {/* Specular rim along the top edge — the cue that sells glass. */}
            <View
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                backgroundColor: isDark ? 'rgba(255,247,237,0.20)' : 'rgba(255,255,255,0.9)',
              }}
            />
          </View>
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: barHeight,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          position: 'absolute',
          bottom: 0,
          left: 8,
          right: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: theme.primaryTint,
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
  const { theme, isDark } = useTheme();

  useEffect(() => {
    if (!loading) {
      // Both are best-effort background work. Left unhandled they surface as
      // bare "ERROR [TypeError: ...]" lines with no stack and no context, which
      // reads like a crash when nothing user-facing has actually failed.
      import('../services/localstore')
        .then((m) => m.initStore())
        .catch((e) => console.warn('localstore: init failed', e));

      checkVersion().catch((e) => console.warn('version check failed', e));
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.primaryTint} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
            <Stack.Screen name="AddDevice" component={AddDeviceScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="RoverHub" component={RoverHubScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Control" component={ControlScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Sensors" component={SensorsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Display" component={DisplayScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Camera" component={CameraScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Clusters" component={ClustersScreen} options={{ animation: 'slide_from_bottom' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
        {/* Outside the navigator so it survives every screen transition. */}
        <NetworkBanner />
      </ToastProvider>
    </ThemeProvider>
  );
}
