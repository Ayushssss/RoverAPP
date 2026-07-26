import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser as useClerkUser, useSignUp, useSignIn } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setUserId, registerUser } from '../services/api';

interface User { id: string; email: string; name: string; emailVerified: boolean; }

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, name: string) => Promise<{ needsVerification: true } | void>;
  verifyEmail: (code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendVerification: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded: authLoaded, signOut } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useClerkUser();
  const { signUp, setActive: setActiveSignUp } = useSignUp();
  const { signIn, setActive: setActiveSignIn } = useSignIn();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (isSignedIn && clerkUser) {
      const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? '';
      const name = clerkUser.firstName || clerkUser.lastName
        ? `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim()
        : email.split('@')[0];
      const emailVerified = clerkUser.emailAddresses?.[0]?.verification?.status === 'verified';

      const u: User = { id: clerkUser.id, email, name, emailVerified };
      setUser(u);
      setUserId(clerkUser.id);

      (async () => {
        await AsyncStorage.setItem('cached_user', JSON.stringify(u));
        if (emailVerified) {
          await registerUser(clerkUser.id, email, name);
        }
      })();
    } else {
      setUser(null);
      setUserId(null);
    }
    setLoading(false);
  }, [isSignedIn, clerkUser, authLoaded, userLoaded]);

  const signup = async (email: string, password: string, name: string) => {
    if (!signUp) throw new Error('Sign in not ready');
    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      return { needsVerification: true as const };
    } catch (e: any) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Signup failed';
      throw new Error(msg);
    }
  };

  const verifyEmail = async (code: string) => {
    if (!signUp) throw new Error('Sign up not ready');
    if (!setActiveSignUp) throw new Error('Session setup not ready');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActiveSignUp({ session: result.createdSessionId });
      } else {
        throw new Error('Verification incomplete');
      }
    } catch (e: any) {
      throw new Error(e.errors?.[0]?.message || 'Invalid code');
    }
  };

  const login = async (email: string, password: string) => {
    if (!signIn || !setActiveSignIn) throw new Error('Sign in not ready');
    try {
      const result = await signIn.create({ identifier: email });
      if (result.status === 'complete') {
        await setActiveSignIn({ session: result.createdSessionId });
        return;
      }
      if (result.status !== 'needs_first_factor') {
        throw new Error(`Unexpected sign-in state: ${result.status}`);
      }
      const pwFactor = result.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'password'
      );
      if (!pwFactor) {
        const available = result.supportedFirstFactors?.map((f: any) => f.strategy).join(', ') || 'none';
        throw new Error(`Password sign-in isn't available for this account. Supported: ${available}`);
      }
      const factorResult = await signIn.attemptFirstFactor({ strategy: 'password', password });
      if (factorResult.status === 'complete') {
        await setActiveSignIn({ session: factorResult.createdSessionId });
        return;
      }
      if (factorResult.status === 'needs_second_factor') {
        const strategies = factorResult.supportedSecondFactors?.map((f: any) => f.strategy).join(', ') || 'none';
        throw new Error(
          `Additional verification required. Available methods: ${strategies}. ` +
          'Check Clerk Dashboard → User & Authentication → Multi-factor settings.'
        );
      }
      throw new Error(`Sign in incomplete (status: ${factorResult.status})`);
    } catch (e: any) {
      if (e.errors?.[0]) {
        throw new Error(e.errors[0].longMessage || e.errors[0].message || 'Invalid email or password');
      }
      throw new Error(e.message || 'Invalid email or password');
    }
  };

  const logout = async () => {
    await signOut();
    await AsyncStorage.removeItem('cached_user');
    setUserId(null);
    setUser(null);
  };

  const sendVerification = async () => {
    if (!signUp) throw new Error('Sign up not ready');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (e: any) {
      throw new Error(e.errors?.[0]?.message || 'Failed to resend');
    }
  };

  const forgotPassword = async (email: string) => {
    if (!signIn) throw new Error('Sign in not ready');
    try {
      const result = await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      if (result.status !== 'needs_first_factor') {
        throw new Error(`Unexpected state: ${result.status}`);
      }
    } catch (e: any) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Failed to send reset code';
      throw new Error(msg);
    }
  };

  const verifyResetCode = async (code: string) => {
    if (!signIn) throw new Error('Sign in not ready');
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      });
      if (result.status !== 'needs_new_password') {
        throw new Error(`Unexpected state: ${result.status}`);
      }
    } catch (e: any) {
      const msg = e.errors?.[0]?.message || 'Invalid code';
      throw new Error(msg);
    }
  };

  const resetPassword = async (newPassword: string) => {
    if (!signIn || !setActiveSignIn) throw new Error('Sign in not ready');
    try {
      const result = await signIn.resetPassword({ password: newPassword });
      if (result.status === 'complete') {
        await setActiveSignIn({ session: result.createdSessionId });
      } else {
        throw new Error(`Password reset incomplete (${result.status})`);
      }
    } catch (e: any) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Failed to reset password';
      throw new Error(msg);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, verifyEmail, login, logout, sendVerification, forgotPassword, verifyResetCode, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
