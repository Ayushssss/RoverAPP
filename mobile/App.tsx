// First import on purpose: installs stack-trace logging before anything else
// has a chance to throw during module evaluation.
import './src/utils/errorTrap';

import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider } from '@clerk/clerk-expo';
import { CLERK_PUBLISHABLE_KEY } from './src/services/clerk';
import { tokenCache } from './src/services/tokenCache';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    // GestureHandlerRootView must wrap the tree or GestureDetector silently
    // does nothing on Android — the joystick would render but never move.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <AuthProvider>
          <SafeAreaProvider>
            <AppNavigator />
          </SafeAreaProvider>
        </AuthProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
