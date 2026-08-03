import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type } from '../theme';
import {
  Screen, Field, Button, Press, FadeIn, IconButton, CodeInput, StrengthMeter, RevealToggle,
} from '../components/ui';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
const CODE_LENGTH = 6;

const STEPS = [
  { key: 'email', icon: 'lock-reset', title: 'Reset password', blurb: "Tell us the email on your account and we'll send a code." },
  { key: 'code', icon: 'email-check-outline', title: 'Check your email', blurb: 'Enter the 6-digit code we just sent.' },
  { key: 'password', icon: 'key-variant', title: 'Set a new password', blurb: 'Pick something at least 8 characters long.' },
] as const;

function StepTrack({ current }: { current: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: rem(spacing.sm) }}>
      <View style={{ flexDirection: 'row', gap: rem(6) }}>
        {STEPS.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: i === current ? 2 : 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= current ? theme.primary : theme.border,
            }}
          />
        ))}
      </View>
      <Text style={{ ...type.micro, color: theme.textMuted, textTransform: 'uppercase' }}>
        Step {current + 1} of {STEPS.length}
      </Text>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const nav = useNavigation<Nav>();
  const { forgotPassword, verifyResetCode, resetPassword } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const meta = STEPS[step];

  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter the email on your account.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep(1);
    } catch (e: any) {
      Alert.alert('Could not send code', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (value?: string) => {
    const finalCode = value ?? code;
    if (finalCode.length < CODE_LENGTH) return;
    setLoading(true);
    try {
      await verifyResetCode(finalCode);
      setStep(2);
    } catch (e: any) {
      Alert.alert('Invalid code', e?.message || 'That code was not accepted.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setPwError('');
    if (newPassword.length < 8) {
      setPwError('Use at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(newPassword);
      Alert.alert('Password updated', 'You can sign in with your new password.', [
        { text: 'Sign in', onPress: () => nav.navigate('Login') },
      ]);
    } catch (e: any) {
      Alert.alert('Could not reset', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => (step === 0 ? nav.goBack() : setStep((s) => s - 1));

  return (
    <Screen>
      <KeyboardAwareScroll
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + rem(spacing.md),
          paddingBottom: insets.bottom + rem(spacing.xxl),
          paddingHorizontal: rem(spacing.xl),
        }}
      >
          <IconButton icon="arrow-left" onPress={goBack} label="Go back" />

          <View style={{ marginTop: rem(spacing.xl) }}>
            <StepTrack current={step} />
          </View>

          <FadeIn key={meta.key} index={0} style={{ marginTop: rem(spacing.xl) }}>
            <View
              style={{
                width: rem(56), height: rem(56), borderRadius: radii.xl,
                backgroundColor: theme.primaryDim,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={meta.icon} size={rem(26)} color={theme.primaryTint} />
            </View>

            <Text style={{ ...type.title, color: theme.text, marginTop: rem(spacing.lg) }}>
              {meta.title}
            </Text>
            <Text style={{ ...type.body, color: theme.textDim, marginTop: rem(spacing.sm) }}>
              {step === 1 ? `Enter the ${CODE_LENGTH}-digit code sent to ${email}.` : meta.blurb}
            </Text>
          </FadeIn>

          <FadeIn key={`${meta.key}-body`} index={1} style={{ marginTop: rem(spacing.xxl) }}>
            {step === 0 && (
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@farm.co"
                keyboardType="email-address"
                onSubmitEditing={handleSendCode}
              />
            )}

            {step === 1 && (
              <CodeInput value={code} onChange={setCode} onComplete={handleVerifyCode} autoFocus />
            )}

            {step === 2 && (
              <View style={{ gap: rem(spacing.md) }}>
                <Field
                  label="New password"
                  value={newPassword}
                  onChangeText={(t) => { setNewPassword(t); if (pwError) setPwError(''); }}
                  placeholder="At least 8 characters"
                  secure={!showPassword}
                  error={pwError}
                  onSubmitEditing={handleReset}
                  right={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((p) => !p)} />}
                />
                {!pwError && <StrengthMeter value={newPassword} />}
              </View>
            )}
          </FadeIn>

          <View style={{ flex: 1, minHeight: rem(spacing.xl) }} />

          <View style={{ gap: rem(spacing.lg), marginTop: rem(spacing.xxl) }}>
            {step === 0 && <Button label="Send code" loading={loading} onPress={handleSendCode} />}
            {step === 1 && (
              <Button
                label="Verify code"
                loading={loading}
                disabled={code.length < CODE_LENGTH}
                onPress={() => handleVerifyCode()}
              />
            )}
            {step === 2 && <Button label="Update password" loading={loading} onPress={handleReset} />}

            <Press onPress={() => nav.navigate('Login')} label="Sign in instead" style={{ alignSelf: 'center' }}>
              <Text style={{ ...type.caption, color: theme.textDim, paddingVertical: rem(spacing.sm) }}>
                Remembered it?{' '}
                <Text style={{ color: theme.primaryTint, fontWeight: '700' }}>Sign in</Text>
              </Text>
            </Press>
          </View>
      </KeyboardAwareScroll>
    </Screen>
  );
}
