import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

function InputField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, theme, error }: any) {
  const [focused, setFocused] = useState(false);
  const hasError = error && !focused;
  return (
    <View style={{
      backgroundColor: theme.surface,
      borderWidth: 1.5,
      borderColor: hasError ? theme.error : focused ? theme.primary : theme.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingTop: 22,
      paddingBottom: 12,
    }}>
      <Text style={{
        position: 'absolute', top: 7, left: 16, fontSize: 10,
        color: hasError ? theme.error : focused ? theme.primary : theme.textMuted,
        textTransform: 'uppercase', letterSpacing: 1.5,
      }}>{label}</Text>
      <TextInput
        style={{ fontSize: 16, color: theme.text, padding: 0, margin: 0 }}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={theme.textMuted}
        autoCapitalize={autoCapitalize || 'none'} keyboardType={keyboardType} secureTextEntry={secureTextEntry}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      />
    </View>
  );
}

export default function SignupScreen() {
  const nav = useNavigation<Nav>();
  const { signup } = useAuth();
  const { theme } = useTheme();
  const { height: winH } = useWindowDimensions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fieldsAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    Animated.timing(fieldsAnim, { toValue: 1, duration: 800, delay: 200, useNativeDriver: Platform.OS !== 'web' }).start();
  }, []);

  const handleSignup = async () => {
    setPwError('');
    setConfirmError('');
    if (!name || !email || !password || !confirmPassword) { Alert.alert('', 'All fields are required'); return; }
    if (password.length < 8) { setPwError('Minimum 8 characters required'); return; }
    if (password !== confirmPassword) { setConfirmError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const result = await signup(email, password, name);
      if (result?.needsVerification) {
        nav.navigate('VerifyEmail');
      }
    } catch (e: any) {
      Alert.alert('Signup failed', e.message || 'Please try again');
    } finally { setLoading(false); }
  };

  const content = (
    <View style={{ paddingTop: winH * 0.1, paddingHorizontal: 24 }}>
      <TouchableOpacity onPress={() => nav.goBack()} style={{ marginBottom: 32, alignSelf: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </View>
      </TouchableOpacity>

      <Animated.View style={{ opacity: fieldsAnim }}>
        <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: theme.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
          <MaterialCommunityIcons name="sprout" size={28} color={theme.primary} />
        </View>

        <Text style={{ fontSize: 32, fontWeight: '800', color: theme.text, letterSpacing: -0.5, lineHeight: 38 }}>Create account</Text>
        <Text style={{ fontSize: 14, color: theme.textDim, marginTop: 8, marginBottom: 32, lineHeight: 20 }}>
          Join the AgriVerse Rover network
        </Text>

        <View style={{ gap: 14 }}>
          <InputField label="Name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words" theme={theme} />
          <InputField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" theme={theme} />
          <View style={{ position: 'relative' }}>
                <InputField label="Password" value={password} onChangeText={(t: string) => { setPassword(t); if (pwError) setPwError(''); }} placeholder="Create a strong password" secureTextEntry={!showPassword} theme={theme} error={pwError} />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, bottom: 12, padding: 4 }}>
                  <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              {pwError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.error} />
                  <Text style={{ fontSize: 12, color: theme.error }}>{pwError}</Text>
                </View>
              ) : password.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 }}>
                  <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: theme.border, overflow: 'hidden' }}>
                    <View style={{
                      width: `${Math.min(100, (password.length / 8) * 100)}%`,
                      height: '100%',
                      borderRadius: 2,
                      backgroundColor: password.length >= 8 ? theme.success : theme.accent,
                    }} />
                  </View>
                  <Text style={{ fontSize: 11, color: password.length >= 8 ? theme.success : theme.textDim }}>
                    {password.length}/8
                  </Text>
                </View>
              ) : null}
              <View style={{ position: 'relative' }}>
                <InputField label="Confirm password" value={confirmPassword} onChangeText={(t: string) => { setConfirmPassword(t); if (confirmError) setConfirmError(''); }} placeholder="Re-enter your password" secureTextEntry={!showConfirm} theme={theme} error={confirmError} />
                <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: 12, bottom: 12, padding: 4 }}>
                  <MaterialCommunityIcons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              {confirmError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.error} />
                  <Text style={{ fontSize: 12, color: theme.error }}>{confirmError}</Text>
                </View>
              ) : null}
            </View>

        <TouchableOpacity style={{ marginTop: 28, borderRadius: 16, overflow: 'hidden' }} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16 }}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Create account</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => nav.navigate('Login')} style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            Already have an account? <Text style={{ color: theme.primary, fontWeight: '600' }}>Sign in</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => nav.navigate('ForgotPassword')} style={{ marginTop: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: theme.textMuted }}>Forgot password?</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <LinearGradient colors={[theme.bg, theme.surface, theme.bg]} locations={[0, 0.5, 1]} style={{ position: 'absolute', inset: 0 }} />
      <View style={{ position: 'absolute', top: -120, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: theme.primaryDim, opacity: 0.3 }} />
      <View style={{ position: 'absolute', bottom: -80, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: theme.accentDim, opacity: 0.2 }} />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {content}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {content}
        </Animated.View>
      )}
    </View>
  );
}
