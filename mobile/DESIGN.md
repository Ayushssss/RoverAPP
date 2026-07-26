# Design System: AgriVerse Rover

## 1. Visual Theme & Atmosphere
A restrained, premium agricultural-tech interface with deliberate warmth. The palette evokes terracotta earth tones with gold hardware accents — like a precision farming console housed in a ceramic workshop. Moderate density (6/10) with confident asymmetrical layouts. Motion is fluid and deliberate (7/10), using spring physics for all interactions and scroll-driven choreography for content reveals.

## 2. Color Palette & Roles
- **Clay Canvas** (#0B0F1C) — Dark mode primary background. Deep charred earth.
- **Sand Surface** (#161B2E) — Card and container fills. Warm-toned dark slate.
- **Terracotta Accent** (#B8532E) — Single accent for CTAs, active states, focus rings. Saturated but grounded.
- **Gold Hardware** (#D4A53A) — Secondary accent for indicators, highlights, and toggle states.
- **Warm Ivory** (#FFF7ED) — Primary text. Sun-bleached bone, never pure white.
- **Faded Earth** (rgba(255,247,237,0.55)) — Secondary text and metadata.
- **Dust Veil** (rgba(255,247,237,0.08)) — Subtle borders. No harsh lines.
- **Light mode:** Canvas White (#FFF8F0), Pure Surface (#FFFFFF), Ink (#3D2314).

**Banned:** Pure black (#000000), neon purple/blue, oversaturated accents, dual competing accent colors.

## 3. Typography Rules
- **Display/Headlines:** Satoshi — Track-tight (-0.5px), weight-driven hierarchy via font-weight (700 → 600 → 500). Never scream with size alone.
- **Body:** Satoshi — Relaxed leading (1.6), max 65ch width. Secondary color for not-critical text.
- **Mono:** JetBrains Mono — For code, joystick coordinates, timestamps, and telemetry numbers.
- **Dashboard Constraint:** Sans-Serif only (Satoshi + JetBrains Mono). No serif fonts anywhere — this is a precision control interface, not an editorial.
- **Banned:** Inter, system fonts for premium contexts. Generic serif (Times, Georgia, Garamond) in any context.

## 4. Component Stylings
- **Buttons:** Flat surface fill, no outer glow. Tactile -1px Y translate on press. Accent fill only for primary CTAs. Ghost/outline for secondary. Rounded-14 (1.75rem).
- **Cards:** Generously rounded (1.25rem). Single pixel border using Dust Veil. Diffused shadow tinted to Clay Canvas. Used only when elevation communicates hierarchy — for lists, use border-top dividers instead.
- **Inputs:** Label anchored above input left (never floating). Focus ring in Terracotta Accent (2px). Helper text optional below. Error text below input in system red. Standard 14px gap.
- **Loaders:** Skeletal shimmer matching exact card/layout dimensions. No circular spinners unless absolutely necessary (joystick connection).
- **Empty States:** Illustrated composition with action-oriented CTA. Never just "No data" text.
- **Tab Bar:** Floating frosted glass. Top border radius 22px. Subtle shadow lifted from bottom.

## 5. Layout Principles
- No overlapping elements — every element occupies its own clear spatial zone. No absolute-positioned stacking.
- Centered Hero layouts banned when variance exceeds 4 — force asymmetric splits or left-aligned.
- Generic "3 equal cards horizontally" layout banned. Use 2-column zig-zag, asymmetric grid, or horizontal scroll.
- CSS Grid over Flexbox math. No `calc()` percentage hacks.
- Contain layout with max-width 1400px when applicable.
- Full-height sections use `min-h-[100dvh]` — never `h-screen`.
- Mobile-first single-column collapse below 768px. No horizontal scroll.
- Touch targets minimum 44px.
- Vertical section gaps scale with `clamp()`.

## 6. Motion & Interaction
- **Spring Physics default:** stiffness 100, damping 20 — premium weighty feel. No linear easing.
- **Perpetual Micro-Interactions:** Connection status pulse, live badge shimmer, joystick coordinate counter updates. Every active component has an infinite loop micro-animation.
- **Scroll-Driven:** Staggered cascade reveals via Reanimated `useAnimatedScrollHandler`. Sections fade-up on appear. Hero parallax with vertical offset.
- **Staggered Orchestration:** Lists never mount instantly — waterfall reveals with 50ms cascade delay.
- **Performance:** Animate exclusively via `transform` and `opacity`. Never animate `top`, `left`, `width`, `height`.

## 7. Anti-Patterns (Banned)
- No emojis anywhere
- No Inter font
- No pure black (#000000)
- No neon/outer glow shadows
- No oversaturated accents (saturation must be below 80%)
- No excessive gradient text on headers
- No custom mouse cursors
- No overlapping elements
- No 3-column equal card layouts
- No generic placeholder names ("John Doe", "Acme", "Nexus")
- No fake round numbers ("99.99%")
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen")
- No filler UI text ("Scroll to explore", bouncing chevrons)
- No broken image links — use SVG avatars or solid color fallbacks
- No centered Heroes for high-variance projects
