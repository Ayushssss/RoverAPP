/**
 * Where the relay lives.
 *
 * Same Mumbai host the mobile app points at (mobile/src/config.ts) — the
 * console and the phone talk to one relay, so a rover driven from a laptop and
 * a rover driven from a phone are the same rover in the same room.
 *
 * This address must match VITE_RELAY_TRANSPORT (see services/relay.ts): the
 * default socket.io transport belongs with this host, and the `ws` transport
 * belongs with the relay in ../../relay. Changing one without the other gets a
 * socket that connects and is then ignored.
 *
 * `VITE_RELAY_URL` overrides at build time; Settings overrides at runtime,
 * because a rover on the bench is usually reachable on the LAN long before it
 * is reachable through a cloud host.
 */
export const DEFAULT_RELAY =
  (import.meta.env.VITE_RELAY_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://roverapp.duckdns.org';

/** The command tokens the drive firmware answers to (rover_controller.ino). */
export const COMMANDS = {
  stop: 'stop',
  light: 'light',
  forward: 'forward',
  backward: 'backward',
  left: 'left',
  right: 'right',
} as const;

/**
 * Presentation for the readings a sensor hub sends.
 *
 * Unknown keys still render — the wire format is an open key→number map so a
 * new sensor appears without a release, and filtering to a known list would
 * throw that away.
 */
export const SENSOR_META: Record<
  string,
  { label: string; unit: string; digits: number; icon: string }
> = {
  tempC: { label: 'Temp', unit: '°C', digits: 1, icon: 'thermometer' },
  humidity: { label: 'Humidity', unit: '%', digits: 0, icon: 'droplets' },
  heatIndexC: { label: 'Feels like', unit: '°C', digits: 1, icon: 'flame' },
  soil: { label: 'Soil', unit: '%', digits: 0, icon: 'sprout' },
  lux: { label: 'Light', unit: 'lx', digits: 0, icon: 'sun' },
  pressureHpa: { label: 'Pressure', unit: 'hPa', digits: 0, icon: 'gauge' },

  // Night rover (night_rover.ino): forward range finder, obstacle flag and
  // headlight level. `obstacle` is 0 or 1 — readings are a key→number map, so
  // it arrives as a number rather than a boolean.
  distanceCm: { label: 'Range', unit: 'cm', digits: 0, icon: 'ruler' },
  obstacle: { label: 'Obstacle', unit: '', digits: 0, icon: 'octagon-alert' },
  headlight: { label: 'Headlight', unit: '', digits: 0, icon: 'lightbulb' },
};
