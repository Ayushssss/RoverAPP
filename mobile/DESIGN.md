# Design System: AgriVerse Rover

This document describes the system as implemented. Source of truth for tokens is
`src/theme/` and `src/motion.ts`; if this file and the code disagree, the code wins
and this file needs the edit.

## 1. Character

A precision agricultural console with deliberate warmth: terracotta earth, gold
hardware, telemetry in mono. Density is moderate; the dashboard leads with one
summary and folds detail behind progressive disclosure. Motion is physical and
purposeful — nothing animates without a reason, everything that animates runs on
the UI thread.

## 2. Colour: schemes and roles

Colour is **role-based**. Components never touch a hex value; they read roles from
`useTheme()` (`primaryTint`, `textDim`, `successDim`, …). Because of that, the
entire app re-skins at runtime.

Five schemes ship (`src/theme/schemes.ts`), each with hand-tuned dark and light
variants, selectable in Settings and persisted:

| Scheme | Character | Seed |
|---|---|---|
| **Terracotta** (default) | Warm earth, gold hardware | `#B8532E` / `#D4A53A` |
| Midnight | Cool indigo, cyan signal | `#2563EB` / `#22D3EE` |
| Meadow | Growing green, dry grass | `#2F8F57` / `#A3B324` |
| Ember | Hot orange over charred red | `#C2410C` / `#EAB308` |
| Slate | Near-monochrome, one indigo accent | `#4F46E5` / `#94A3B8` |

Key role distinctions — get these wrong and text becomes unreadable:

- `primary` — a **fill**. Must hold 4.5:1 against `primaryOn` text placed on it.
- `primaryTint` — the same hue as **text/icon on the background**. Lifted in dark
  mode, deepened in light. Never use `primary` as text.
- `accent` (gold family) is hardware: indicators, toggles, live badges. It is not
  a second CTA colour.
- `*Dim` roles are 8–16% alpha washes for icon chips and selected states.
- Semantic colour is never the only signal — every state pairs colour with an
  icon, label, or position.

Errors stay `#DC2626`-based and success stays green in every scheme.

## 3. Typography

- Platform UI faces (SF / Roboto) via weight-driven hierarchy: 700 display/titles,
  600 subheads, 400 body. Scale lives in `theme.ts` (`type.*`), sized through
  `rem()` which tracks device width, capped at 1.3×.
- **Mono** (`fonts.mono`) is mandatory for telemetry: MAC addresses, coordinates,
  GPIO pins, command tokens, timestamps.
- Micro-labels: 10px, weight 600, `letterSpacing 1.4`, uppercase.
- To adopt Satoshi later: load via `expo-font`, set `fonts.display`/`fonts.body` —
  nothing else changes.

## 4. Motion (`src/motion.ts`)

All animation runs through **Reanimated worklets on the UI thread**. The core
`Animated` API is not used; React Spring and GSAP are deliberately absent
(second animation system, DOM-only respectively).

- Micro-interactions 150–300ms. Exits run at **65% of enter** duration.
- Ease-out on enter, ease-in on exit; springs for anything physical:
  `press` (critically damped), `entrance`, `bouncy` (toggles only), `snap`.
- Press feedback: 3% scale + 1px depth (`Press` in `ui.tsx`), interruptible.
- Lists cascade with a 40ms stagger, capped at 8 steps so long lists don't queue.
- Loops (`PulseDot`, skeleton shimmer, joystick breath) use
  `withRepeat(..., -1, true)` — the ping-pong form. Nested
  `withDelay`-in-`withSequence`-in-`withRepeat` stalls after one leg; don't.
- Scroll-driven work (hero parallax) uses `useAnimatedScrollHandler`.
- **Reduced motion is honoured everywhere** via `useReducedMotion()`: loops stop,
  entrances snap, the 3D rover falls back to SVG, the success overlay skips.
- Never animate colour through the core Animated API with the native driver — it
  throws on device and silently works on web. (Reanimated's `interpolateColor`
  is fine.)

## 5. Materials & glassmorphism

`Glass` (`src/components/Glass.tsx`) is the only sanctioned frosted surface.
What makes it read as glass: a **low tint** (≤30% where real blur exists), a
**specular top rim**, and a **sheen gradient** across the upper third.

Platform truth, stated plainly:

- **iOS**: real backdrop blur via system materials (`systemThinMaterial*`,
  `systemChromeMaterial*` on the tab bar).
- **Android**: no backdrop blur (`blurMethod: 'none'` — the dimezis renderer
  requires a `blurTarget` we don't wire). The fill is heavier (62–78%) so the
  surface reads as deliberate layering, not a broken effect.
- Glass only goes **over content** (hero photography, scrolling lists). Over a
  flat background it's a tinted rectangle and is not used.

Current mounts: tab bar, fleet-status card, dropdown menu, toasts.

## 6. Depth & imagery

- Elevation is tinted to the canvas (`elevation(theme.shadow, 1|2|3)`); on web it
  emits `boxShadow` (the `shadow*` props are deprecated there).
- Remote imagery goes through `expo-image` with a **blurhash placeholder** and a
  320ms cross-fade (`src/media.ts`). No grey boxes, no layout jumps, explicit
  width/quality params on Unsplash URLs.
- **3D**: `Rover3D` — a procedural low-poly rover (primitives only, no model
  files) on a slow turntable via `expo-gl` + `expo-three`, flat-shaded in palette
  colours, fake disc shadow instead of shadow maps. Native only; web and reduced
  motion get the animated SVG `RoverMark`. 3D is reserved for the intro — it does
  not belong on working screens.
- **Lottie**: hand-authored inline JSON only (no asset pipeline). Currently one
  animation — the success check (`SuccessCheck.tsx`) used in the pairing
  overlay. Keep Lottie for confirmation moments, not decoration.

## 7. Feedback & haptics (`src/haptics.ts`)

- Haptics always accompany a visual change, never replace one: `press` on CTAs,
  `tap` on icon buttons/copy, `selection` on segmented choices and drag swaps,
  `success`/`warning`/`error` notifications. Not on plain list rows.
- **Toasts** (bottom, glass, auto-dismiss 4s, max two, `aria-live` polite) for
  outcomes the user can keep working through; `Alert` only for destructive
  confirms. Destructive flows offer **Undo** in the toast.
- Skeletons (opacity shimmer, staggered `delay`) — never spinners for content.
  Spinners only for indeterminate hardware waits (camera stream).
- Empty states are illustrated (`Illustrations.tsx`) with one action. Never bare
  "No data".
- Connectivity: `NetworkBanner` distinguishes *no network* from *no internet* —
  LAN rover control works without internet, and the copy says so.

## 8. Layout

- Safe areas everywhere via `useSafeAreaInsets` — no hardcoded status-bar pads.
- Spacing on the 4pt scale (`spacing.*` through `rem()`); cards `radii.xl`,
  sheets/menus `radii.xxl`, chips full.
- Headers: `TabHeader` (tab roots) / `ScreenHeader` (pushed screens). Sheets are
  bottom-anchored with a grab handle.
- Touch targets ≥44pt; icon-only controls carry `accessibilityLabel` (enforced
  by `Press`'s `label` prop).
- Forms scroll the focused field above the keyboard (`KeyboardAwareScroll`) —
  including the 6-box code input.
- One primary CTA per screen. Overlap is allowed only where engineered for
  (fleet card over hero, with reserved hero padding).

## 9. Interactive patterns

- **Joystick**: gesture-handler + worklets, relative drag, 6% dead zone, emits at
  25Hz. Idle breath stops on grab.
- **Drag-to-reorder** (`DraggableList`): 180ms long-press pick-up, live index
  swaps with haptic ticks, springs home. Requires uniform row height.
- **Free-placement canvas** (`DraggableGrid`): square cells, 6 columns. Buttons
  carry their own coordinates (`pos`) rather than a place in a flow, so they sit
  where they were dropped. Placements live in one shared value: moves, resizes
  and collision checks all run on the UI thread and cross into JS only to
  commit. 150ms long-press picks a tile up; it tracks the finger while a ghost
  shows the snapped target, tinted by whether the cells are free — an occupied
  drop springs back. Handles appear on the selected tile only (one per axis
  plus a corner, 15pt), because a pad of small buttons disappears under its own
  chrome otherwise.
- **Blueprint grid** (`GridBackdrop`, via `Screen grid`): one repeating SVG
  pattern, never a stack of views. A radial vignette dissolves the lines into
  the canvas at the edges — that fade is what makes it read as infinite rather
  than a bounded sheet. Inside `DraggableGrid` the same component runs at the
  layout's own cell pitch, unfaded and dotted, as snap guides.
- **Progressive disclosure**: `Collapsible` with a summary line that's useful
  unexpanded. The dashboard shows a preview of rovers (3) + "All N".
- **Custom control pads**: per-rover, stored by MAC in AsyncStorage; buttons
  target the main control screen or a separate pad, where they carry a cell
  footprint (`size`, default 2×1) and a position (`pos`, assigned by
  `ensurePlacements`) on the free-placement canvas. Command tokens are C-safe
  (`toCommandToken`), collisions with stock firmware commands are blocked, and
  firmware generation mirrors the real wire format
  (`{ type: "command", command, value }`).

## 10. Banned

- Emojis as icons (MaterialCommunityIcons only)
- Pure black `#000000` surfaces; neon/outer glow
- Raw hex in components (roles only)
- `Animated` core API for new work; React Spring; any DOM animation library
- Floating placeholder labels (labels sit above fields)
- Spinners for content loading; blank empty states
- Centered hero + three-equal-cards dashboard layouts
- Blur over flat backgrounds; tints ≥40% over a real blur
- Fabricated data (fake battery %, invented uptime) — derive or omit
- AI-copy clichés ("Elevate", "Seamless", "Unleash")
- Unlabelled icon-only touch targets
