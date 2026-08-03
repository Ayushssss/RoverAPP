import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, {
  Defs, Pattern, Path, Rect, RadialGradient, Stop, Circle,
} from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

/**
 * Pattern ids are global to the SVG renderer on some platforms, so two
 * backdrops on one screen would fight over `url(#cells)`. A counter is enough
 * and, unlike React's `useId`, produces something legal inside a url().
 */
let seq = 0;

/**
 * Blueprint grid. Drawn as a repeating SVG pattern rather than a stack of
 * views, so the cost is one node no matter how many cells are on screen.
 *
 * The vignette is what sells "infinite": lines dissolve into the canvas at
 * every edge instead of stopping at a hard boundary, so the sheet reads as
 * something the screen is a window onto.
 */
export default function GridBackdrop({
  cell = 30,
  majorEvery = 4,
  strength = 1,
  fade = true,
  dots = false,
  offsetX = 0,
  offsetY = 0,
  tint,
}: {
  /** Minor cell pitch in px. Match it to a layout grid to align the two. */
  cell?: number;
  /** Every nth line is drawn heavier. 0 turns majors off. */
  majorEvery?: number;
  /** Multiplier on line opacity — dial the grid back under dense content. */
  strength?: number;
  /** Dissolve the lines toward the edges. Off inside a bounded container. */
  fade?: boolean;
  /** Mark cell corners with a dot — reads as snap targets while editing. */
  dots?: boolean;
  offsetX?: number;
  offsetY?: number;
  tint?: string;
}) {
  const { theme, isDark } = useTheme();
  const id = useMemo(() => `grid${seq++}`, []);

  const line = tint || theme.borderStrong;
  const minorOpacity = (isDark ? 0.34 : 0.28) * strength;
  const majorOpacity = (isDark ? 0.55 : 0.42) * strength;
  const major = cell * majorEvery;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={`${id}-minor`}
            width={cell}
            height={cell}
            x={offsetX}
            y={offsetY}
            patternUnits="userSpaceOnUse"
          >
            {/* Two edges per tile — drawing all four would double-stroke every
                shared border and read twice as heavy. */}
            <Path
              d={`M ${cell} 0 L 0 0 L 0 ${cell}`}
              stroke={line}
              strokeOpacity={minorOpacity}
              strokeWidth={0.5}
              fill="none"
            />
            {dots && <Circle cx={0} cy={0} r={1.4} fill={line} fillOpacity={majorOpacity} />}
          </Pattern>

          {majorEvery > 0 && (
            <Pattern
              id={`${id}-major`}
              width={major}
              height={major}
              x={offsetX}
              y={offsetY}
              patternUnits="userSpaceOnUse"
            >
              <Path
                d={`M ${major} 0 L 0 0 L 0 ${major}`}
                stroke={line}
                strokeOpacity={majorOpacity}
                strokeWidth={0.9}
                fill="none"
              />
            </Pattern>
          )}

          <RadialGradient id={`${id}-fade`} cx="50%" cy="42%" r="72%">
            <Stop offset="0%" stopColor={theme.bg} stopOpacity={0} />
            <Stop offset="62%" stopColor={theme.bg} stopOpacity={0.15} />
            <Stop offset="100%" stopColor={theme.bg} stopOpacity={0.92} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}-minor)`} />
        {majorEvery > 0 && (
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}-major)`} />
        )}
        {fade && <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}-fade)`} />}
      </Svg>
    </View>
  );
}
