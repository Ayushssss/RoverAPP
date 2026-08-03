/**
 * Minimal ambient typing for three.js.
 *
 * `@types/three` currently refuses to install against this dependency tree
 * (peer conflict via expo-three), and Rover3D only touches a handful of
 * classes. Loose typing here is contained to one decorative component.
 */
declare module 'three';
