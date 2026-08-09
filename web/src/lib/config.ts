/**
 * Where the relay lives.
 *
 * Same Singapore host the mobile app points at (mobile/src/config.ts) — the
 * console and the phone talk to one relay, so a rover driven from a laptop and
 * a rover driven from a phone are the same rover in the same room.
 *
 * Overridable at runtime from Settings, because a rover on the bench is often
 * reachable on the LAN long before it is reachable through a cloud host.
 */
export const DEFAULT_RELAY = 'https://roverapp-3b7v.onrender.com';

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
};
