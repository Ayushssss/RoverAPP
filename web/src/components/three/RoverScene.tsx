import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

/**
 * A procedural low-poly rover.
 *
 * Primitives only — no model files, no asset pipeline, nothing to 404. The
 * whole machine is nine boxes and six cylinders, which keeps it under a
 * kilobyte of geometry and means it re-colours with the scheme instead of
 * baking a palette into a binary.
 *
 * Two jobs, one model:
 *   `showcase`  — a slow turntable for the landing page.
 *   `attitude`  — driven by the live stick vector, so the thing on screen turns
 *                 the way the machine in the field is being told to turn.
 *
 * The second is the one that earns its place. A number reading `x: -0.62` tells
 * you less at a glance than a rover visibly swinging left.
 */

interface Palette {
  primary: string;
  primaryTint: string;
  accent: string;
  surface: string;
  ink: string;
}

/** Roles, read once from the live scheme. */
function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>({
    primary: '#B8532E',
    primaryTint: '#E8825A',
    accent: '#D4A53A',
    surface: '#161B2E',
    ink: '#FFF7ED',
  });

  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      const pick = (name: string, fallback: string) =>
        s.getPropertyValue(name).trim() || fallback;
      setPalette({
        primary: pick('--c-primary', '#B8532E'),
        primaryTint: pick('--c-primary-tint', '#E8825A'),
        accent: pick('--c-accent', '#D4A53A'),
        surface: pick('--c-raised', '#1E2538'),
        ink: pick('--c-ink', '#FFF7ED'),
      });
    };
    read();
    // The scheme picker flips one attribute on <html>; watching it is what
    // makes the 3D rover re-skin along with everything else.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

function Wheel({
  position,
  spin,
  color,
  rim,
}: {
  position: [number, number, number];
  spin: React.RefObject<number>;
  color: string;
  rim: string;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.x += spin.current * delta * 6;
  });

  return (
    <group ref={ref} position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.26, 14]} />
        <meshStandardMaterial color={color} flatShading roughness={0.85} metalness={0.1} />
      </mesh>
      {/* Hub. Without it a spinning wheel is a featureless disc and reads as
          stationary no matter how fast it turns. */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 10]} />
        <meshStandardMaterial color={rim} flatShading metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0.24]}>
        <boxGeometry args={[0.07, 0.03, 0.3]} />
        <meshStandardMaterial color={rim} flatShading />
      </mesh>
    </group>
  );
}

function Chassis({
  palette,
  heading,
  mode,
  lightOn,
}: {
  palette: Palette;
  heading: React.RefObject<{ x: number; y: number }>;
  mode: 'showcase' | 'attitude';
  lightOn: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const mast = useRef<THREE.Group>(null);
  const spin = useRef(0);

  useFrame((state, delta) => {
    const { x, y } = heading.current;
    // Wheels turn at the magnitude of the commanded vector, signed by throttle,
    // so reversing visibly reverses rather than just slowing down.
    spin.current = THREE.MathUtils.damp(spin.current, y || (x !== 0 ? 0.35 : 0), 6, delta);

    if (!body.current) return;

    if (mode === 'showcase') {
      body.current.rotation.y += delta * 0.28;
      // A slight bob, so a static model doesn't read as a rendered image.
      body.current.position.y = Math.sin(state.clock.elapsedTime * 1.1) * 0.045;
      return;
    }

    // Attitude: steer is yaw, throttle is a little pitch and roll into the
    // turn. Damped rather than set, or the model would snap between frames of
    // a 25Hz stream and look mechanical in the wrong way.
    const targetYaw = -x * 0.9;
    const targetPitch = -y * 0.18;
    const targetRoll = -x * 0.14;

    body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, targetYaw, 5, delta);
    body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, targetPitch, 5, delta);
    body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, targetRoll, 5, delta);
    body.current.position.y = THREE.MathUtils.damp(
      body.current.position.y,
      Math.abs(y) * 0.04,
      5,
      delta
    );

    // The camera mast counter-rotates a touch, the way a gimbal would.
    if (mast.current) {
      mast.current.rotation.y = THREE.MathUtils.damp(mast.current.rotation.y, x * 0.5, 4, delta);
    }
  });

  return (
    <group ref={body}>
      {/* Hull */}
      <mesh castShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[1.85, 0.42, 1.15]} />
        <meshStandardMaterial color={palette.primary} flatShading roughness={0.55} metalness={0.25} />
      </mesh>

      {/* Deck / solar panel */}
      <mesh castShadow position={[0, 0.76, 0]} rotation={[-0.05, 0, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.95]} />
        <meshStandardMaterial color={palette.surface} flatShading metalness={0.65} roughness={0.28} />
      </mesh>
      {[-0.45, 0, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.8, 0]} rotation={[-0.05, 0, 0]}>
          <boxGeometry args={[0.03, 0.01, 0.9]} />
          <meshStandardMaterial color={palette.primaryTint} flatShading />
        </mesh>
      ))}

      {/* Sensor pod */}
      <mesh castShadow position={[-0.62, 0.88, 0]}>
        <boxGeometry args={[0.34, 0.2, 0.34]} />
        <meshStandardMaterial color={palette.surface} flatShading roughness={0.6} />
      </mesh>

      {/* Camera mast */}
      <group ref={mast} position={[0.6, 0.74, 0]}>
        <mesh castShadow position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.045, 0.055, 0.5, 8]} />
          <meshStandardMaterial color={palette.surface} flatShading metalness={0.6} />
        </mesh>
        <mesh castShadow position={[0, 0.54, 0]}>
          <boxGeometry args={[0.26, 0.2, 0.22]} />
          <meshStandardMaterial color={palette.surface} flatShading roughness={0.4} />
        </mesh>
        {/* Lens. Emissive so it reads as a live instrument rather than a bump. */}
        <mesh position={[0.14, 0.54, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
          <meshStandardMaterial
            color={palette.accent}
            emissive={palette.accent}
            emissiveIntensity={0.7}
            flatShading
          />
        </mesh>
      </group>

      {/* Headlight bar — lit only when the real headlight is on, so the model
          agrees with the hardware instead of decorating. */}
      <mesh position={[-0.94, 0.55, 0]}>
        <boxGeometry args={[0.05, 0.12, 0.7]} />
        <meshStandardMaterial
          color={lightOn ? '#FFF7ED' : palette.surface}
          emissive={lightOn ? '#FFF3D6' : '#000000'}
          emissiveIntensity={lightOn ? 1.4 : 0}
          flatShading
        />
      </mesh>
      {lightOn && <pointLight position={[-1.6, 0.6, 0]} intensity={6} distance={4} color="#FFE9B8" />}

      {/* Wheels */}
      {(
        [
          [0.62, 0.42, 0.68],
          [0.62, 0.42, -0.68],
          [-0.62, 0.42, 0.68],
          [-0.62, 0.42, -0.68],
        ] as Array<[number, number, number]>
      ).map((p) => (
        <Wheel key={p.join()} position={p} spin={spin} color="#20242F" rim={palette.primaryTint} />
      ))}
    </group>
  );
}

function Scene({
  palette,
  heading,
  mode,
  lightOn,
}: {
  palette: Palette;
  heading: React.RefObject<{ x: number; y: number }>;
  mode: 'showcase' | 'attitude';
  lightOn: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={2.1} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} color={palette.primaryTint} />
      <pointLight position={[0, 2.5, 3]} intensity={12} distance={9} color={palette.accent} />

      <Chassis palette={palette} heading={heading} mode={mode} lightOn={lightOn} />

      {/* A grounded shadow instead of a shadow map — cheaper, and it reads as
          the rover sitting on something rather than floating. */}
      <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={7} blur={2.6} far={3} resolution={512} />
    </>
  );
}

/**
 * The scene itself.
 *
 * This module is the only place three.js is imported, and it is reached solely
 * through the lazy boundary in `Rover3D.tsx` — roughly 1.1MB of engine that a
 * console showing telemetry over a slow field connection should not be made to
 * download before it can render a number.
 */
export default function RoverScene({
  mode = 'showcase',
  heading,
  lightOn = false,
  className,
  height = 320,
}: {
  mode?: 'showcase' | 'attitude';
  /** Live stick vector. Read through a ref so 25Hz updates never re-render. */
  heading?: React.RefObject<{ x: number; y: number }>;
  lightOn?: boolean;
  className?: string;
  height?: number;
}) {
  const palette = usePalette();
  const idle = useRef({ x: 0, y: 0 });
  const vector = heading ?? idle;

  return (
    <div className={className} style={{ height }} aria-hidden>
      <Canvas
        shadows
        // Capped: this is a decorative layer on a page whose real job is
        // telemetry, and a retina canvas at dpr 3 costs more than it returns.
        dpr={[1, 1.75]}
        camera={{ position: [3.6, 2.4, 4.2], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <Suspense fallback={null}>
          <Scene palette={palette} heading={vector} mode={mode} lightOn={lightOn} />
        </Suspense>
      </Canvas>
    </div>
  );
}
