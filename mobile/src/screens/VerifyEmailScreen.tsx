import React, { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type } from '../theme';
import { Screen, Button, Press, FadeIn, CodeInput } from '../components/ui';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const { verifyEmail, sendVerification, logout } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const handleVerify = async (value?: string) => {
    const finalCode = value ?? code;
    if (finalCode.length < CODE_LENGTH) {
      Alert.alert('Incomplete code', `Enter all ${CODE_LENGTH} digits.`);
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(finalCode);
      // AuthContext sets the user on success; the navigator swaps stacks.
    } catch (e: any) {
      Alert.alert('Invalid code', e?.message || 'That code was not accepted.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendVerification();
      setSecondsLeft(RESEND_COOLDOWN);
      Alert.alert('Code sent', 'Check your inbox for a fresh code.');
    } catch (e: any) {
      Alert.alert('Could not resend', e?.message || 'Try again in a moment.');
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAwareScroll
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + rem(spacing.xxl),
          paddingBottom: insets.bottom + rem(spacing.xxl),
          paddingHorizontal: rem(spacing.xl),
        }}
      >
          <FadeIn index={0}>
            <View
              style={{
                width: rem(64), height: rem(64), borderRadius: radii.xl,
                backgroundColor: theme.primaryDim,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name="shield-check-outline" size={rem(30)} color={theme.primaryTint} />
            </View>
          </FadeIn>

          <FadeIn index={1} style={{ marginTop: rem(spacing.xl) }}>
            <Text style={{ ...type.title, color: theme.text }}>Verify your email</Text>
            <Text style={{ ...type.body, color: theme.textDim, marginTop: rem(spacing.sm) }}>
              We sent a {CODE_LENGTH}-digit code to your inbox. It expires in 10 minutes.
            </Text>
          </FadeIn>

          <FadeIn index={2} style={{ marginTop: rem(spacing.xxl) }}>
            <CodeInput value={code} onChange={setCode} onComplete={handleVerify} autoFocus />
          </FadeIn>

          <FadeIn index={3} style={{ marginTop: rem(spacing.xxl), gap: rem(spacing.lg) }}>
            <Button
              label="Verify account"
              loading={loading}
              disabled={code.length < CODE_LENGTH}
              onPress={() => handleVerify()}
            />

            <Press onPress={handleResend} disabled={resending || secondsLeft > 0} label="Resend verification code" style={{ alignSelf: 'center' }}>
              <Text
                style={{
                  ...type.caption,
                  color: secondsLeft > 0 ? theme.textMuted : theme.primaryTint,
                  fontWeight: '600',
                  paddingVertical: rem(spacing.sm),
                }}
              >
                {resending ? 'Sending…' : secondsLeft > 0 ? `Resend available in ${secondsLeft}s` : 'Resend code'}
              </Text>
            </Press>

            <Press onPress={logout} label="Use a different account" style={{ alignSelf: 'center' }}>
              <Text style={{ ...type.caption, color: theme.textMuted, paddingVertical: rem(4) }}>
                Use a different account
              </Text>
            </Press>
          </FadeIn>
      </KeyboardAwareScroll>
    </Screen>
  );
}
