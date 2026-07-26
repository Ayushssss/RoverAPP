import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type CameraRoute = RouteProp<RootStackParamList, 'Camera'>;

export default function CameraScreen() {
  const nav = useNavigation();
  const route = useRoute<CameraRoute>();
  const { theme } = useTheme();
  const { deviceName, ip } = route.params;
  const [loading, setLoading] = React.useState(true);
  const streamUrl = `http://${ip}:81/stream`;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{deviceName} Camera</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.streamArea}>
        {loading && <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />}
        <Image
          source={{ uri: streamUrl, headers: { 'Cache-Control': 'no-cache' } }}
          style={styles.stream}
          resizeMode="contain"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        {!loading && (
          <View style={[styles.liveBadge, { backgroundColor: theme.error }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  streamArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stream: { width: '100%', height: '100%' },
  loader: { position: 'absolute' },
  liveBadge: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 1.5 },
});
