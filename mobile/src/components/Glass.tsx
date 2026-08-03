import React from 'react';
import { View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { radii } from '../theme';

/** #RRGGBB -> "r, g, b" so the surface colour can take an alpha. */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return '22, 27, 46';
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 0-100. 40-60 reads as glass; above ~80 it becomes frosted plastic. */
  intensity?: number;
  radius?: number;
  /** Diagonal sheen across the top edge. Off for small chrome like toasts. */
  sheen?: boolean;
}

/**
 * Frosted glass surface.
 *
 * Three things make this read as glass rather than a grey card, and all three
 * matter:
 *
 * 1. A *low* tint. The fill exists only to guarantee text contrast — push it
 *    past ~30% and it paints over the blur entirely, which is the classic way
 *    glassmorphism ends up looking like a flat panel.
 * 2. A specular top edge. Real glass catches light on its upper rim, so the
 *    border is brighter on top than on the sides. This is the single biggest
 *    cue and costs nothing.
 * 3. A sheen gradient falling off across the upper third, standing in for the
 *    saturation boost `backdrop-filter: saturate()` gives on the web — which
 *    expo-blur does not expose.
 *
 * Only use this over something with visual interest behind it. Over a flat
 * background there is nothing to refract and you pay a blur pass for a tint.
 */
export default function Glass({
  children, style, intensity, radius = radii.xl, sheen = true,
}: Props) {
  const { theme, isDark } = useTheme();

  // iOS gets a real backdrop blur, so the fill can stay light and let it show.
  // Android has none, so it needs a heavier fill to read as a surface at all —
  // the same value on both would look washed out on one and muddy on the other.
  const blurred = Platform.OS === 'ios';
  const fillAlpha = blurred ? (isDark ? 0.28 : 0.3) : (isDark ? 0.62 : 0.78);

  const fill = isDark
    ? `rgba(${hexToRgb(theme.surface)}, ${fillAlpha})`
    : `rgba(255, 255, 255, ${fillAlpha})`;
  const rim = isDark ? 'rgba(255,247,237,0.22)' : 'rgba(255,255,255,0.85)';
  const edge = isDark ? 'rgba(255,247,237,0.09)' : 'rgba(61,35,20,0.09)';

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView
        intensity={intensity ?? (isDark ? 55 : 75)}
        // System materials on iOS give a truer frosted look than a flat tint.
        tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
        // Android's `dimezisBlurView` needs a `blurTarget` ref pointing at a
        // BlurTargetView wrapping the content to blur. Without one it silently
        // falls back to 'none' and warns on every render — so we ask for
        // 'none' explicitly and carry Android on the tint, sheen and rim below.
        blurMethod="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View style={{ backgroundColor: fill }}>
        {sheen && (
          <LinearGradient
            colors={[
              isDark ? 'rgba(255,247,237,0.10)' : 'rgba(255,255,255,0.55)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '65%' }}
            pointerEvents="none"
          />
        )}
        {children}
      </View>

      {/* Rim light: brighter along the top edge, softer around the rest. */}
      <View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: edge,
          borderTopColor: rim,
          pointerEvents: 'none',
        }}
      />
    </View>
  );
}
