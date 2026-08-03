import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../motion';
import { RoverMark } from './Illustrations';

interface Props {
  size?: number;
}

/**
 * Procedural low-poly rover on a slow turntable — the brand mark in 3D.
 *
 * three.js drives expo-gl's context **directly**, on purpose. The usual bridge,
 * expo-three, imports @expo/browser-polyfill at module scope, which fabricates
 * `window.location`/`document` globally — Clerk then mistakes the runtime for a
 * browser and crashes on `new URL('')`. Passing the GL context straight to
 * THREE.WebGLRenderer with a stub canvas needs no polyfill and poisons nothing.
 *
 * Built entirely from primitives so there is no model file, no asset pipeline,
 * nothing to download. Native-only: web and reduced-motion render the SVG mark.
 *
 * Every GL path here is guarded. This is decoration on the first screen of the
 * app, and a driver quirk on one phone must never be able to stop the app from
 * opening — it falls back to the flat mark instead.
 */
export default function Rover3D({ size = 180 }: Props) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const bg = theme.bg;

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // Minimal canvas stand-in — three only reads dimensions and listeners.
    const canvasStub = {
      width, height,
      clientWidth: width, clientHeight: height,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
    };

    /**
     * three refuses any context that is `instanceof WebGLRenderingContext`
     * ("WebGL 1 is not supported since r163"). expo-gl's context trips that
     * check by class while actually implementing the WebGL 2 API — its own
     * type declares `extends WebGL2RenderingContext` — so the guard rejects a
     * context it would be perfectly happy with.
     *
     * Hiding the global for the length of the constructor is enough to get
     * past it. JS is single-threaded, so nothing else can observe the gap,
     * and it is put back in `finally` regardless.
     */
    const globals = globalThis as any;
    const RealWebGL1 = globals.WebGLRenderingContext;
    // `any` because three is ambient-typed here (see src/types/three.d.ts).
    let renderer: any;
    try {
      globals.WebGLRenderingContext = undefined;
      renderer = new THREE.WebGLRenderer({
        context: gl as any,
        canvas: canvasStub as any,
        antialias: true,
      });
    } finally {
      globals.WebGLRenderingContext = RealWebGL1;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    // Solid background matching the screen — GLView transparency is
    // unreliable on Android, and a matching fill is indistinguishable.
    scene.background = new THREE.Color(bg);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(3.4, 2.4, 4.6);
    camera.lookAt(0, 0.25, 0);

    // Warm key light echoing the palette's low sun; cool fill so the shadow
    // side never goes dead black.
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
    key.position.set(4, 6, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ea2c9, 0.7);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x60524a, 1.1));

    // ── Materials (flat-shaded => faceted low-poly read) ──
    const terracotta = new THREE.MeshLambertMaterial({ color: 0xb8532e, flatShading: true });
    const clay = new THREE.MeshLambertMaterial({ color: 0x8a3f24, flatShading: true });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd4a53a, flatShading: true });
    const charcoal = new THREE.MeshLambertMaterial({ color: 0x22242e, flatShading: true });
    const panel = new THREE.MeshLambertMaterial({ color: 0x1d2a4a, flatShading: true });

    const rover = new THREE.Group();

    // Chassis
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.15), terracotta);
    body.position.y = 0.55;
    rover.add(body);

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 1.3), clay);
    skirt.position.y = 0.32;
    rover.add(skirt);

    // Wheels — hexagonal cylinders keep the faceted look
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 6);
    const wheels: any[] = [];
    ([[-0.72, 0.68], [0.72, 0.68], [-0.72, -0.68], [0.72, -0.68]] as const).forEach(([x, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, charcoal);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.3, z);
      rover.add(wheel);
      wheels.push(wheel);
    });

    // Solar panel, slightly pitched toward the sun
    const solar = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.85), panel);
    solar.position.set(-0.15, 0.92, 0);
    solar.rotation.z = -0.09;
    rover.add(solar);

    // Camera mast with a gold sensor head
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), charcoal);
    mast.position.set(0.62, 1.15, 0);
    rover.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.2), gold);
    head.position.set(0.62, 1.56, 0);
    rover.add(head);

    // Antenna
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), gold);
    antenna.position.set(-0.75, 1.05, -0.35);
    rover.add(antenna);

    // Ground shadow — a soft dark disc is far cheaper than real shadow maps
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    rover.add(shadow);

    scene.add(rover);

    let t = 0;
    const loop = () => {
      if (!mountedRef.current) return;
      t += 1 / 60;

      rover.rotation.y = t * 0.5;                    // slow turntable
      rover.position.y = Math.sin(t * 1.6) * 0.035;  // gentle field bob
      wheels.forEach((w) => { w.rotation.y = t * 1.4; });

      try {
        renderer.render(scene, camera);
        gl.endFrameEXP();
      } catch (e) {
        // A throw inside requestAnimationFrame escapes every error boundary
        // React has, so it has to be caught right here or it reaches the
        // global handler as a fatal.
        console.warn('[Rover3D] render failed — falling back to the flat mark', e);
        setFailed(true);
        return;
      }

      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
    } catch (e) {
      // Reached when the context itself is unusable: an old driver, a device
      // without OpenGL ES 3.0, a headless emulator.
      console.warn('[Rover3D] GL unavailable — falling back to the flat mark', e);
      setFailed(true);
    }
  }, [bg]);

  // Web, reduced motion, and anything the GPU refused all land on the SVG mark.
  if (Platform.OS === 'web' || reduced || failed) {
    return <RoverMark size={size * 0.55} animate={!reduced} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* Keyed by background so a scheme change remounts with the right fill */}
      <GLView key={bg} style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}
