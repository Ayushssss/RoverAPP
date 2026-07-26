import { API_URL } from '../config';
import { Alert, Linking } from 'react-native';

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
    const { latest, minRequired, apkUrl } = await res.json();
    const downloadUrl = apkUrl || `${API_URL}/downloads/AgriverseROVER-v${latest}.apk`;

    if (isOlder(LOCAL_VERSION, minRequired)) {
      Alert.alert(
        'Update required',
        'A new version is required to continue.',
        [{ text: 'Download', onPress: () => Linking.openURL(downloadUrl) }],
        { cancelable: false }
      );
      return;
    }

    if (isOlder(LOCAL_VERSION, latest)) {
      Alert.alert(
        'Update available',
        'A new version is available. Download now?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Download', onPress: () => Linking.openURL(downloadUrl) },
        ]
      );
    }
  } catch {}
}
