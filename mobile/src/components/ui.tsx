import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Platform,
  ActivityIndicator, ViewStyle, TextStyle, StyleProp, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay,
  withRepeat, interpolate, interpolateColor, Extrapolation,
  LinearTransition, FadeIn as RFadeIn, FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop as SvgStop, Ellipse } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { rem, radii, spacing, type, fonts, elevation } from '../theme';
import {
  springs, timings, staggerDelay, useReducedMotion, PRESS_SCALE, PRESS_DEPTH,
} from '../motion';
import { haptics } from '../haptics';
import { useKeyboardAware } from './KeyboardAwareScroll';
import GridBackdrop from './GridBackdrop';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/* ────────────────────────────── motion ────────────────────────────── */

/**
 * Tactile press: a 3% scale-down with 1px of depth, driven on the UI thread so
 * it stays responsive while JS is busy fetching. Interruptible — the spring
 * retargets mid-flight instead of queueing.
 */
export function Press({
  children, onPress, onLongPress, disabled, style, hitSlop, label, role = 'button',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  /** Announced by screen readers. Required whenever the child is icon-only. */
  label?: string;
  role?: 'button' | 'link' | 'none';
}) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
    transform: reduced
      ? []
      : [
          { scale: interpolate(pressed.value, [0, 1], [1, PRESS_SCALE]) },
          { translateY: interpolate(pressed.value, [0, 1], [0, PRESS_DEPTH]) },
        ],
  }));

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={onPress || onLongPress ? role : undefined}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        onPressIn={() => { pressed.value = withSpring(1, springs.press); }}
        onPressOut={() => { pressed.value = withSpring(0, springs.press); }}
        hitSlop={hitSlop ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : undefined}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Waterfall reveal. The stagger stops compounding after a handful of rows so
 * the last item in a long list doesn't arrive noticeably late.
 */
export function FadeIn({
  children, index = 0, style, distance = 18,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  distance?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(staggerDelay(index), withTiming(1, timings.enter));
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [distance, 0], Extrapolation.CLAMP) },
    ],
  }));

  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/**
 * Perpetual micro-interaction for anything live. The halo expands as it fades,
 * which reads as a signal radiating out rather than a blinking dot.
 * Skipped entirely under reduced motion — a static dot still conveys state.
 */
export function PulseDot({ color, size = 7, halo = true }: { color: string; size?: number; halo?: boolean }) {
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.28, timings.loop), -1, true);
  }, [reduced]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.28, 1], [0, 0.9]),
    transform: [{ scale: interpolate(pulse.value, [0.28, 1], [1.35, 0.85]) }],
  }));

  const box = halo ? size * 2.4 : size;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      {halo && (
        <Animated.View
          style={[
            {
              position: 'absolute', width: box, height: box, borderRadius: box / 2,
              borderWidth: 1.5, borderColor: color,
            },
            haloStyle,
          ]}
        />
      )}
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          dotStyle,
        ]}
      />
    </View>
  );
}

/* ────────────────────────────── surfaces ────────────────────────────── */

/**
 * Warm ambient wash. Painted as SVG radial gradients rather than translucent
 * circles so the falloff is soft — a flat circle reads as a hard disc.
 */
function Wash() {
  const { theme, isDark } = useTheme();
  const strength = isDark ? 1 : 0.7;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="washPrimary" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0%" stopColor={theme.primaryTint} stopOpacity={0.22 * strength} />
            <SvgStop offset="55%" stopColor={theme.primaryTint} stopOpacity={0.07 * strength} />
            <SvgStop offset="100%" stopColor={theme.primaryTint} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="washAccent" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0%" stopColor={theme.accent} stopOpacity={0.16 * strength} />
            <SvgStop offset="60%" stopColor={theme.accent} stopOpacity={0.05 * strength} />
            <SvgStop offset="100%" stopColor={theme.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="88%" cy="4%" rx="62%" ry="30%" fill="url(#washPrimary)" />
        <Ellipse cx="6%" cy="94%" rx="55%" ry="26%" fill="url(#washAccent)" />
      </Svg>
    </View>
  );
}

export function Screen({
  children, style, wash = true, grid = false, gridCell, gridStrength,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  wash?: boolean;
  /** Blueprint grid under the wash — for the surfaces you build a rig on. */
  grid?: boolean;
  /** Cell pitch, so a screen can line the backdrop up with its own layout. */
  gridCell?: number;
  gridStrength?: number;
}) {
  const { theme } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.bg }, style]}>
      {/* Grid first: the wash is warm colour that should sit over the lines,
          not be cut by them. */}
      {grid && <GridBackdrop cell={gridCell} strength={gridStrength} />}
      {wash && <Wash />}
      {children}
    </View>
  );
}

export function Card({
  children, style, padded = true, onPress, dashed = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  dashed?: boolean;
}) {
  const { theme } = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: theme.border,
          borderStyle: dashed ? 'dashed' : 'solid',
          padding: padded ? rem(spacing.lg) : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
}

/* ────────────────────────────── headers ────────────────────────────── */

export function ScreenHeader({
  title, subtitle, onBack, right, sticky = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  sticky?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + rem(spacing.sm),
        paddingHorizontal: rem(spacing.xl),
        paddingBottom: rem(spacing.md),
        flexDirection: 'row',
        alignItems: 'center',
        gap: rem(spacing.md),
        borderBottomWidth: sticky ? 1 : 0,
        borderBottomColor: theme.border,
      }}
    >
      {onBack && (
        <IconButton icon="arrow-left" onPress={onBack} label="Go back" />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...type.heading, color: theme.text }}>{title}</Text>
        {!!subtitle && (
          <Text numberOfLines={1} style={{ ...type.caption, color: theme.textDim, marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

/** Large left-aligned title for the four tab roots. */
export function TabHeader({
  title, subtitle, right, loading,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + rem(spacing.sm),
        paddingHorizontal: rem(spacing.xl),
        paddingBottom: rem(spacing.md),
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: rem(spacing.md),
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...type.title, color: theme.text }}>{title}</Text>
        {!!subtitle && (
          <Text numberOfLines={1} style={{ ...type.caption, color: theme.textDim, marginTop: 2, opacity: loading ? 0 : 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({
  title, accent, right, style,
}: {
  title: string;
  accent?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rem(spacing.sm) },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.sm), flex: 1, minWidth: 0 }}>
        <View style={{ width: 3, height: rem(15), borderRadius: 2, backgroundColor: accent || theme.primaryTint }} />
        <Text numberOfLines={1} style={{ ...type.subheading, color: theme.text }}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/* ────────────────────────────── controls ────────────────────────────── */

export function Button({
  label, onPress, loading, disabled, variant = 'primary', icon, style, full = true,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger' | 'gold';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const { theme } = useTheme();
  const off = disabled || loading;

  const skin: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.primary, fg: theme.primaryOn, border: 'transparent' },
    gold: { bg: theme.accent, fg: theme.accentOn, border: 'transparent' },
    ghost: { bg: 'transparent', fg: theme.text, border: theme.borderStrong },
    danger: { bg: theme.errorDim, fg: theme.errorTint, border: theme.error + '40' },
  };
  const s = skin[variant];

  // Haptics ride along with buttons only. Firing on every Press would put a
  // buzz behind list rows and chips, which reads as noise rather than feedback.
  const handlePress = () => {
    if (variant === 'danger') haptics.warning();
    else haptics.press();
    onPress?.();
  };

  return (
    <Press onPress={handlePress} disabled={off} label={label} style={[full && { alignSelf: 'stretch' }, style]}>
      <View
        style={{
          backgroundColor: s.bg,
          borderColor: s.border,
          borderWidth: 1,
          borderRadius: radii.lg,
          minHeight: 52,
          paddingVertical: rem(15),
          paddingHorizontal: rem(spacing.xl),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: rem(spacing.sm),
          opacity: off ? 0.45 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={s.fg} />
        ) : (
          <>
            {icon && <MaterialCommunityIcons name={icon} size={rem(18)} color={s.fg} />}
            <Text style={{ fontSize: rem(15), fontWeight: '700', color: s.fg, letterSpacing: 0.2 }}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Press>
  );
}

export function IconButton({
  icon, onPress, active, disabled, tint, label, size = 42,
}: {
  icon: IconName;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  tint?: string;
  label?: string;
  size?: number;
}) {
  const { theme } = useTheme();
  const color = tint || theme.text;
  return (
    <Press
      onPress={onPress ? () => { haptics.tap(); onPress(); } : undefined}
      disabled={disabled}
      label={label}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radii.md,
          backgroundColor: active ? (tint || theme.primary) : theme.surface,
          borderWidth: 1,
          borderColor: active ? 'transparent' : theme.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <MaterialCommunityIcons
          name={icon}
          size={rem(19)}
          color={active ? (tint === theme.accent ? theme.accentOn : theme.primaryOn) : color}
        />
      </View>
    </Press>
  );
}

/**
 * The knob overshoots slightly on flip — the bounce is what sells a switch as
 * a physical thing. Track and knob colours cross-fade on the UI thread, which
 * the core Animated API can't do at all.
 */
export function Toggle({ value, onChange }: { value: boolean; onChange?: () => void }) {
  const { theme } = useTheme();
  const pos = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    pos.value = withSpring(value ? 1 : 0, springs.bouncy);
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pos.value, [0, 1], [theme.bgSunken, theme.accent]),
    borderColor: interpolateColor(pos.value, [0, 1], [theme.border, 'rgba(0,0,0,0)']),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pos.value, [0, 1], [theme.textMuted, theme.accentOn]),
    transform: [{ translateX: interpolate(pos.value, [0, 1], [0, 22], Extrapolation.CLAMP) }],
  }));

  return (
    <Pressable onPress={onChange} accessibilityRole="switch" accessibilityState={{ checked: value }} hitSlop={8}>
      <Animated.View
        style={[
          { width: 48, height: 28, borderRadius: 14, padding: 3, borderWidth: 1 },
          trackStyle,
        ]}
      >
        <Animated.View style={[{ width: 20, height: 20, borderRadius: 10 }, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

/* ────────────────────────────── inputs ────────────────────────────── */

/** Label anchored above the input, left — never floating (DESIGN.md §4). */
export function Field({
  label, value, onChangeText, placeholder, error, hint, secure, keyboardType,
  autoCapitalize = 'none', maxLength, mono, right, autoFocus, onSubmitEditing, editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'characters';
  maxLength?: number;
  mono?: boolean;
  right?: React.ReactNode;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  editable?: boolean;
}) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<View>(null);
  const { ensureVisible } = useKeyboardAware();
  const showError = !!error && !focused;
  const ring = showError ? theme.error : focused ? theme.ring : theme.border;

  return (
    <View ref={wrapRef} collapsable={false} style={{ gap: rem(spacing.sm) }}>
      <Text
        style={{
          ...type.micro,
          color: showError ? theme.errorTint : focused ? theme.primaryTint : theme.textDim,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.surface,
          borderRadius: radii.lg,
          borderWidth: focused || showError ? 2 : 1,
          borderColor: ring,
          paddingHorizontal: rem(spacing.lg) - (focused || showError ? 1 : 0),
          minHeight: 54,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            fontSize: rem(16),
            color: theme.text,
            paddingVertical: rem(14),
            ...(mono ? { fontFamily: fonts.mono, letterSpacing: 1.6 } : null),
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          autoFocus={autoFocus}
          editable={editable}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => { setFocused(true); ensureVisible(wrapRef); }}
          onBlur={() => setFocused(false)}
        />
        {right}
      </View>

      {showError ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(6) }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={rem(14)} color={theme.errorTint} />
          <Text style={{ ...type.caption, color: theme.errorTint }}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={{ ...type.caption, color: theme.textMuted }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: rem(4) }}>
      <MaterialCommunityIcons
        name={shown ? 'eye-off-outline' : 'eye-outline'}
        size={rem(20)}
        color={theme.textDim}
      />
    </TouchableOpacity>
  );
}

export function StrengthMeter({ value, min = 8 }: { value: string; min?: number }) {
  const { theme } = useTheme();
  if (!value) return null;

  const long = value.length >= min;
  const varied = /[0-9]/.test(value) && /[a-zA-Z]/.test(value);
  const level = !long ? 1 : varied && value.length >= 12 ? 3 : 2;
  const meta = [
    { label: 'Too short', color: theme.errorTint },
    { label: 'Acceptable', color: theme.accentTint },
    { label: 'Strong', color: theme.successTint },
  ][level - 1];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.sm) }}>
      <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              backgroundColor: i <= level ? meta.color : theme.border,
            }}
          />
        ))}
      </View>
      <Text style={{ ...type.caption, color: meta.color }}>{meta.label}</Text>
    </View>
  );
}

/** Six-box code entry with auto-advance, backspace walk-back and paste support. */
export function CodeInput({
  value, onChange, onComplete, length = 6, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const { theme } = useTheme();
  const refs = useRef<(TextInput | null)[]>([]);
  const wrapRef = useRef<View>(null);
  const { ensureVisible } = useKeyboardAware();
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => refs.current[0]?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  /**
   * The code is held as a dense string, so clearing a box also drops everything
   * to its right — otherwise a gap in the middle would silently shift the
   * digits after it and the length check would pass on the wrong code.
   */
  const handleChange = (raw: string, index: number) => {
    const cleaned = raw.replace(/[^0-9]/g, '');

    if (!cleaned) {
      onChange(value.slice(0, index));
      return;
    }

    const spread = cleaned.slice(0, length - index);
    const next = (value.slice(0, index) + spread).slice(0, length);
    onChange(next);

    const landing = Math.min(index + spread.length, length - 1);
    refs.current[landing]?.focus();
    if (next.length === length) onComplete?.(next);
  };

  const handleKey = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      onChange(value.slice(0, index - 1));
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={{ flexDirection: 'row', gap: rem(spacing.sm), justifyContent: 'center' }}
    >
      {digits.map((digit, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            maxWidth: rem(54),
            aspectRatio: 0.82,
            borderRadius: radii.lg,
            borderWidth: digit ? 2 : 1,
            borderColor: digit ? theme.ring : theme.border,
            backgroundColor: theme.surface,
            overflow: 'hidden',
          }}
        >
          <TextInput
            ref={(r) => { refs.current[i] = r; }}
            style={{
              width: '100%',
              height: '100%',
              textAlign: 'center',
              fontSize: rem(22),
              fontWeight: '700',
              color: theme.text,
              ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
            }}
            keyboardType="number-pad"
            maxLength={length}
            value={digit}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={(e) => handleKey(e, i)}
            onFocus={() => ensureVisible(wrapRef)}
            selectTextOnFocus
            caretHidden
          />
        </View>
      ))}
    </View>
  );
}

/* ────────────────────────────── display ────────────────────────────── */

export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { theme } = useTheme();
  return (
    <Text style={[{ ...type.mono, color: theme.textSecondary }, style]}>{children}</Text>
  );
}

export function StatusPill({
  label, tone = 'neutral', live,
}: {
  label: string;
  tone?: 'neutral' | 'online' | 'offline' | 'gold';
  live?: boolean;
}) {
  const { theme } = useTheme();
  const map = {
    neutral: { fg: theme.textDim, bg: theme.bgSunken, dot: theme.textMuted },
    online: { fg: theme.successTint, bg: theme.successDim, dot: theme.successTint },
    offline: { fg: theme.errorTint, bg: theme.errorDim, dot: theme.errorTint },
    gold: { fg: theme.accentTint, bg: theme.accentDim, dot: theme.accent },
  }[tone];

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: rem(6),
        paddingLeft: live ? rem(4) : rem(10), paddingRight: rem(10), paddingVertical: rem(4),
        borderRadius: radii.full, backgroundColor: map.bg,
      }}
    >
      {live ? <PulseDot color={map.dot} size={5} /> : <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: map.dot }} />}
      <Text style={{ fontSize: rem(11), fontWeight: '600', color: map.fg, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { theme } = useTheme();
  const c = color || theme.accentTint;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: rem(10),
        paddingVertical: rem(4),
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: c + '55',
        backgroundColor: c + '1A',
      }}
    >
      <Text style={{ ...type.micro, color: c }}>{label}</Text>
    </View>
  );
}

/**
 * Progressive disclosure. The summary line always carries enough to act on;
 * the body holds the detail you only want when you're actually digging.
 */
export function Collapsible({
  title, summary, icon, iconColor, children, defaultOpen = false, style,
}: {
  title: string;
  summary?: string;
  icon?: IconName;
  iconColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const turn = useSharedValue(defaultOpen ? 1 : 0);

  useEffect(() => {
    turn.value = withSpring(open ? 1 : 0, springs.snap);
  }, [open]);

  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(turn.value, [0, 1], [0, 180])}deg` }],
  }));

  const tint = iconColor || theme.primaryTint;

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(22).stiffness(170)}
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Pressable
        onPress={() => { haptics.tap(); setOpen((o) => !o); }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={open ? 'Collapses this section' : 'Expands this section'}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: rem(spacing.md),
          padding: rem(spacing.lg),
          backgroundColor: pressed ? theme.primaryDim : 'transparent',
        })}
      >
        {icon && (
          <View
            style={{
              width: rem(34), height: rem(34), borderRadius: radii.md,
              backgroundColor: tint + '1F', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name={icon} size={rem(17)} color={tint} />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...type.bodyStrong, color: theme.text }} numberOfLines={1}>{title}</Text>
          {!!summary && (
            <Text style={{ ...type.caption, color: theme.textDim, marginTop: 1 }} numberOfLines={1}>
              {summary}
            </Text>
          )}
        </View>

        <Animated.View style={chevron}>
          <MaterialCommunityIcons name="chevron-down" size={rem(20)} color={theme.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View
          entering={RFadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={{
            paddingHorizontal: rem(spacing.lg),
            paddingBottom: rem(spacing.lg),
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingTop: rem(spacing.lg),
          }}
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/**
 * Proportional composition bar. Segments carry a label as well as a colour,
 * so the split is still readable without relying on hue alone.
 */
/**
 * The segment field is `count`, not `value`, on purpose: the Reanimated Babel
 * plugin statically flags any `.value` appearing inside a `style` prop as a
 * misused shared value, and would spam a warning per render for a plain number.
 */
export function MetricBar({
  segments, height = 8,
}: {
  segments: { count: number; color: string; label: string }[];
  height?: number;
}) {
  const { theme } = useTheme();
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <View style={{ gap: rem(spacing.md) }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={segments.map((s) => `${s.count} ${s.label}`).join(', ')}
        style={{
          flexDirection: 'row',
          height,
          borderRadius: height / 2,
          overflow: 'hidden',
          backgroundColor: theme.bgSunken,
        }}
      >
        {total > 0 &&
          segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <View key={s.label} style={{ flex: s.count, backgroundColor: s.color }} />
            ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rem(spacing.md) }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: rem(6) }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.color }} />
            <Text style={{ ...type.caption, color: theme.textDim }}>
              {s.label} <Text style={{ color: theme.text, fontWeight: '700' }}>{s.count}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function EmptyState({
  art, title, body, actionLabel, onAction,
}: {
  art?: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: rem(spacing.xl), paddingVertical: rem(spacing.xxl) }}>
      {art}
      <Text style={{ ...type.heading, color: theme.text, marginTop: rem(spacing.xl), textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        style={{
          ...type.body, color: theme.textDim, marginTop: rem(spacing.sm),
          textAlign: 'center', maxWidth: rem(280),
        }}
      >
        {body}
      </Text>
      {actionLabel && (
        <Button label={actionLabel} onPress={onAction} full={false} style={{ marginTop: rem(spacing.xl) }} />
      )}
    </View>
  );
}

/** Row used by Profile/Settings lists — border-top dividers, no nested cards. */
export function ListRow({
  icon, iconColor, label, value, right, onPress, first, danger,
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  danger?: boolean;
}) {
  const { theme } = useTheme();
  const tint = danger ? theme.errorTint : iconColor || theme.textDim;

  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: rem(spacing.md),
        paddingVertical: rem(14),
        paddingHorizontal: rem(spacing.lg),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.border,
        minHeight: 56,
      }}
    >
      {icon && (
        <View
          style={{
            width: rem(36), height: rem(36), borderRadius: radii.md,
            backgroundColor: danger ? theme.errorDim : tint + '1A',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon} size={rem(18)} color={tint} />
        </View>
      )}
      <Text style={{ ...type.body, color: danger ? theme.errorTint : theme.text, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {!!value && <Text style={{ ...type.caption, color: theme.textDim }}>{value}</Text>}
      {right ?? (onPress && !danger ? (
        <MaterialCommunityIcons name="chevron-right" size={rem(18)} color={theme.textMuted} />
      ) : null)}
    </View>
  );

  return onPress ? <Press onPress={onPress}>{inner}</Press> : inner;
}

export const shadow = elevation;
