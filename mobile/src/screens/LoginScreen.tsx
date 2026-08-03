import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type } from '../theme';
import {
  Screen, Field, Button, Press, FadeIn, IconButton, RevealToggle, CodeInput,
} from '../components/ui';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { login, verifySecondFactor } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter both your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result && 'needsSecondFactor' in result) setNeedsCode(true);
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (value?: string) => {
    const finalCode = value ?? code;
    if (finalCode.length < 6) return;
    setLoading(true);
    try {
      await verifySecondFactor(finalCode);
    } catch (e: any) {
      Alert.alert('Verification failed', e?.message || 'That code was not accepted.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAwareScroll
        contentContainerStyle={{
          paddingTop: insets.top + rem(spacing.md),
          paddingBottom: insets.bottom + rem(spacing.xxl),
          paddingHorizontal: rem(spacing.xl),
          flexGrow: 1,
        }}
      >
          <FadeIn index={0}>
            <IconButton icon="arrow-left" onPress={() => nav.goBack()} label="Go back" />
          </FadeIn>

          <FadeIn index={1} style={{ marginTop: rem(spacing.xxl) }}>
            <Text style={{ ...type.display, color: theme.text }}>Welcome back</Text>
            <Text style={{ ...type.body, color: theme.textDim, marginTop: rem(spacing.sm) }}>
              Sign in to reach your rovers.
            </Text>
          </FadeIn>

          <FadeIn index={2} style={{ marginTop: rem(spacing.xxl), gap: rem(18) }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@farm.co"
              keyboardType="email-address"
            />

            <View style={{ gap: rem(spacing.sm) }}>
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                secure={!showPassword}
                onSubmitEditing={handleLogin}
                right={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((p) => !p)} />}
              />
              <Press onPress={() => nav.navigate('ForgotPassword')} label="Reset your password" style={{ alignSelf: 'flex-end' }}>
                <Text style={{ ...type.caption, color: theme.textDim, paddingVertical: rem(4) }}>
                  Forgot password?
                </Text>
              </Press>
            </View>
          </FadeIn>

          {needsCode && (
            <FadeIn
              index={0}
              style={{
                marginTop: rem(spacing.xl),
                padding: rem(spacing.lg),
                borderRadius: radii.xl,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                gap: rem(spacing.lg),
              }}
            >
              <View>
                <Text style={{ ...type.bodyStrong, color: theme.text }}>One more step</Text>
                <Text style={{ ...type.caption, color: theme.textDim, marginTop: 2 }}>
                  Enter the 6-digit code we emailed you.
                </Text>
              </View>
              <CodeInput value={code} onChange={setCode} onComplete={handleVerifyCode} autoFocus />
            </FadeIn>
          )}

          <View style={{ flex: 1, minHeight: rem(spacing.xl) }} />

          <FadeIn index={3} style={{ gap: rem(spacing.lg), marginTop: rem(spacing.xxl) }}>
            <Button
              label={needsCode ? 'Verify code' : 'Sign in'}
              loading={loading}
              disabled={needsCode && code.length < 6}
              onPress={() => (needsCode ? handleVerifyCode() : handleLogin())}
            />
            <Press onPress={() => nav.navigate('Signup')} label="Create an account" style={{ alignSelf: 'center' }}>
              <Text style={{ ...type.caption, color: theme.textDim, paddingVertical: rem(spacing.sm) }}>
                No account yet?{' '}
                <Text style={{ color: theme.primaryTint, fontWeight: '700' }}>Create one</Text>
              </Text>
            </Press>
          </FadeIn>
      </KeyboardAwareScroll>
    </Screen>
  );
}
