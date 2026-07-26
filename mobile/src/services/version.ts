import { API_URL } from '../config';
import { Alert, Platform, Linking } from 'react-native';

const LOCAL_VERSION = '1.0.1'; // must match app.json "version"

function parse(v: string): number[] {
  return v.split('.').map(Number);
}

function isOlder(local: string, remote: string): boolean {
  const l = parse(local);
  const r = parse(remote);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const a = l[i] || 0;
    const b = r[i] || 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

export async function checkVersion(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const { latest, minRequired } = await res.json();

    if (isOlder(LOCAL_VERSION, minRequired)) {
      Alert.alert(
        'Update required',
        'Please update the app to continue.',
        [{ text: 'Update', onPress: () => {
          const url = Platform.OS === 'android'
            ? 'https://play.google.com/store/apps/details?id=agriverse.com'
            : 'https://apps.apple.com/app/id...';
          Linking.openURL(url);
        }}],
        { cancelable: false }
      );
      return;
    }

    if (isOlder(LOCAL_VERSION, latest)) {
      Alert.alert(
        'Update available',
        'A new version is available. Would you like to update?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Update', onPress: () => {
            const url = Platform.OS === 'android'
              ? 'https://play.google.com/store/apps/details?id=agriverse.com'
              : 'https://apps.apple.com/app/id...';
            Linking.openURL(url);
          }},
        ]
      );
    }
  } catch {}
}
