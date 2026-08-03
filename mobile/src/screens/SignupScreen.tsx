import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, type } from '../theme';
import {
  Screen, Field, Button, Press, FadeIn, IconButton, RevealToggle, StrengthMeter,
} from '../components/ui';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

export default function SignupScreen() {
  const nav = useNavigation<Nav>();
  const { signup } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const handleSignup = async () => {
    setPwError('');
    setConfirmError('');

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing details', 'All fields are required.');
      return;
    }
    if (password.length < 8) {
      setPwError('Use at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await signup(email.trim(), password, name.trim());
      if (result?.needsVerification) nav.navigate('VerifyEmail');
    } catch (e: any) {
      Alert.alert('Signup failed', e?.message || 'Please try again.');
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
        }}
      >
          <FadeIn index={0}>
            <IconButton icon="arrow-left" onPress={() => nav.goBack()} label="Go back" />
          </FadeIn>

          <FadeIn index={1} style={{ marginTop: rem(spacing.xxl) }}>
            <Text style={{ ...type.display, color: theme.text }}>Create account</Text>
            <Text style={{ ...type.body, color: theme.textDim, marginTop: rem(spacing.sm) }}>
              Register once, then pair as many rovers as you run.
            </Text>
          </FadeIn>

          <FadeIn index={2} style={{ marginTop: rem(spacing.xxl), gap: rem(18) }}>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@farm.co"
              keyboardType="email-address"
            />

            <View style={{ gap: rem(spacing.md) }}>
              <Field
                label="Password"
                value={password}
                onChangeText={(t) => { setPassword(t); if (pwError) setPwError(''); }}
                placeholder="At least 8 characters"
                secure={!showPassword}
                error={pwError}
                right={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((p) => !p)} />}
              />
              {!pwError && <StrengthMeter value={password} />}
            </View>

            <Field
              label="Confirm password"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); if (confirmError) setConfirmError(''); }}
              placeholder="Repeat your password"
              secure={!showConfirm}
              error={confirmError}
              onSubmitEditing={handleSignup}
              right={<RevealToggle shown={showConfirm} onToggle={() => setShowConfirm((p) => !p)} />}
            />
          </FadeIn>

          <FadeIn index={3} style={{ gap: rem(spacing.lg), marginTop: rem(spacing.xxl) }}>
            <Button label="Create account" loading={loading} onPress={handleSignup} />

            <Press onPress={() => nav.navigate('Login')} label="Sign in instead" style={{ alignSelf: 'center' }}>
              <Text style={{ ...type.caption, color: theme.textDim, paddingVertical: rem(spacing.sm) }}>
                Already registered?{' '}
                <Text style={{ color: theme.primaryTint, fontWeight: '700' }}>Sign in</Text>
              </Text>
            </Press>
          </FadeIn>
      </KeyboardAwareScroll>
    </Screen>
  );
}
