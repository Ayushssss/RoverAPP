import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type, elevation } from '../theme';
import { haptics } from '../haptics';
import Glass from './Glass';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onPress: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: Toast['action'] }) => void;
  success: (message: string, action?: Toast['action']) => void;
  error: (message: string, action?: Toast['action']) => void;
}

const ToastContext = createContext<ToastApi>({
  show: () => {},
  success: () => {},
  error: () => {},
});

const VISIBLE_MS = 4000;
/** More than a couple stacked and it stops being transient feedback. */
const MAX_VISIBLE = 2;

export function useToast() {
  return useContext(ToastContext);
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { theme } = useTheme();

  const tone = {
    success: { fg: theme.successTint, bg: theme.successDim, icon: 'check-circle-outline' as const },
    error: { fg: theme.errorTint, bg: theme.errorDim, icon: 'alert-circle-outline' as const },
    info: { fg: theme.accentTint, bg: theme.accentDim, icon: 'information-outline' as const },
  }[toast.tone];

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(20).stiffness(160)}
      exiting={FadeOut.duration(180)}
      // Announced without stealing focus, per WCAG guidance for transient status.
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ borderRadius: radii.lg, ...elevation(theme.shadow, 2) }}
    >
      <Glass radius={radii.lg} sheen={false} style={{ flexDirection: 'row' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: rem(spacing.md),
          paddingVertical: rem(spacing.md),
          paddingHorizontal: rem(spacing.lg),
          flex: 1,
        }}
      >
      <View
        style={{
          width: rem(28), height: rem(28), borderRadius: rem(14),
          backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={tone.icon} size={rem(16)} color={tone.fg} />
      </View>

      <Text style={{ ...type.caption, color: theme.text, flex: 1 }} numberOfLines={3}>
        {toast.message}
      </Text>

      {toast.action ? (
        <Pressable
          onPress={() => {
            toast.action?.onPress();
            onDismiss(toast.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
          hitSlop={8}
        >
          <Text style={{ ...type.caption, fontWeight: '700', color: theme.primaryTint }}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => onDismiss(toast.id)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8}>
          <MaterialCommunityIcons name="close" size={rem(16)} color={theme.textMuted} />
        </Pressable>
      )}
      </View>
      </Glass>
    </Animated.View>
  );
}

/**
 * Transient feedback that doesn't hijack the screen. Use this for outcomes the
 * user can keep working through; keep `Alert` for decisions that genuinely
 * need to block, like confirming a delete.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastApi['show']>((message, opts) => {
    const toast: Toast = {
      id: nextId.current++,
      message,
      tone: opts?.tone ?? 'info',
      action: opts?.action,
    };

    setToasts((list) => [...list, toast].slice(-MAX_VISIBLE));
    timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), VISIBLE_MS));
  }, [dismiss]);

  const success = useCallback<ToastApi['success']>((message, action) => {
    haptics.success();
    show(message, { tone: 'success', action });
  }, [show]);

  const error = useCallback<ToastApi['error']>((message, action) => {
    haptics.error();
    show(message, { tone: 'error', action });
  }, [show]);

  // Clear every pending timer on unmount so a dismissed screen can't call
  // setState after teardown.
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error }}>
      {children}
      {toasts.length > 0 && (
        <View
          // Only the rows capture touches; the gap between them stays
          // transparent so the UI underneath is still reachable.
          style={{
            position: 'absolute',
            // Sits above the floating tab bar; the offline banner owns the top
            // edge, so the two can never collide.
            bottom: insets.bottom + rem(84),
            left: rem(spacing.lg),
            right: rem(spacing.lg),
            gap: rem(spacing.sm),
            pointerEvents: 'box-none',
          }}
        >
          {toasts.map((t) => (
            <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </View>
      )}
    </ToastContext.Provider>
  );
}
