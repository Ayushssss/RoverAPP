/**
 * The relay connection — transport selector.
 *
 * Two transports exist and they are not interchangeable at runtime, because a
 * relay speaks one or the other:
 *
 *   socketio  ../relay.socketio.ts   The deployed relay at roverapp.duckdns.org
 *             (server/). Carries camera, LCD, board roster and paired tilt
 *             controllers as well as drive and telemetry. This is what the
 *             mobile app speaks, so it is the default — a console that cannot
 *             reach the relay everything else already uses is a broken console.
 *
 *   ws        ../relay.ws.ts         The relay in ../../relay. Verifies the
 *             Supabase access token rather than trusting a user id, and keys
 *             rooms by MAC. Drive and telemetry only.
 *
 * Choose with VITE_RELAY_TRANSPORT=ws at build time. Both modules export the
 * same surface, so nothing downstream knows which one it is talking to.
 *
 * Switching the default is a two-part change: this line AND the relay the
 * console points at. Changing one without the other produces a socket that
 * connects and is then ignored, which looks exactly like a rover that is
 * switched off.
 */

import * as socketio from './relay.socketio';
import * as ws from './relay.ws';

const useWs = (import.meta.env.VITE_RELAY_TRANSPORT as string | undefined) === 'ws';

const impl = useWs ? ws : socketio;

export type { LinkState, BoardRole, BoardInfo, CameraStatus } from './relay.socketio';

export const getLinkState = impl.getLinkState;
export const onLinkState = impl.onLinkState;

export const connect = impl.connect;
export const acquire = impl.acquire;
export const release = impl.release;
export const disconnect = impl.disconnect;
export const reconnect = impl.reconnect;

export const registerRover = impl.registerRover;
export const onDeviceIp = impl.onDeviceIp;
export const onBoards = impl.onBoards;
export const onTelemetry = impl.onTelemetry;
export const onControllerInput = impl.onControllerInput;

export const onCameraAvailable = impl.onCameraAvailable;
export const onCameraFrame = impl.onCameraFrame;
export const onCameraError = impl.onCameraError;
export const startCamera = impl.startCamera;
export const stopCamera = impl.stopCamera;

export const sendJoystick = impl.sendJoystick;
export const sendCommand = impl.sendCommand;
export const sendDisplay = impl.sendDisplay;
