import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { clusters as clustersApi } from '../services/api';
import { useTheme } from '../context/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Clusters'>;
interface Cluster { id: string; name: string; description: string; }

export default function ClustersScreen() {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const [clusterList, setClusterList] = useState<Cluster[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const load = async () => { try { setClusterList(await clustersApi.list()); } catch {} };
  useFocusEffect(useCallback(() => { load(); }, []));
  const create = async () => {
    if (!newName.trim()) { Alert.alert('', 'Name required'); return; }
    try { await clustersApi.create({ name: newName.trim(), description: newDesc.trim() }); setModalVisible(false); setNewName(''); setNewDesc(''); load();
    } catch (e: any) { Alert.alert('Error', e?.message || e?.response?.data?.error || 'Failed'); }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.backArrow, { color: theme.text }]}>←</Text></TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Clusters</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={[styles.addBtn, { backgroundColor: theme.primaryDim }]}><Text style={[styles.addIcon, { color: theme.primary }]}>+</Text></TouchableOpacity>
      </View>
      <FlatList
        data={clusterList} keyExtractor={item => item.id}
        contentContainerStyle={clusterList.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyIcon, { color: theme.textMuted }]}>⊞</Text></View>
            <Text style={[styles.emptyTitle, { color: theme.textDim }]}>No clusters</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>Group devices into clusters</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardIcon, { backgroundColor: theme.primaryDim }]}><Text style={[styles.cardIconText, { color: theme.primary }]}>⊞</Text></View>
            <View style={styles.cardBody}><Text style={[styles.cardName, { color: theme.text }]}>{item.name}</Text>{item.description ? <Text style={[styles.cardDesc, { color: theme.textDim }]}>{item.description}</Text> : null}</View>
          </View>
        )}
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New cluster</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="Cluster name" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
            <TextInput style={[styles.modalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="Description" placeholderTextColor={theme.textMuted} value={newDesc} onChangeText={setNewDesc} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={[styles.cancelText, { color: theme.textDim }]}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={create} style={styles.confirmBtn}>
                <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.confirmGrad}>
                  <Text style={styles.confirmText}>Create</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 20 }, title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  addBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  addIcon: { fontSize: 22 },
  list: { paddingHorizontal: 24, paddingBottom: 100 }, emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center' },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600' }, emptySub: { fontSize: 13, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 10 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardIconText: { fontSize: 20 }, cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600' }, cardDesc: { fontSize: 12, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  modal: { borderRadius: 20, padding: 24, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, letterSpacing: -0.3 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { padding: 12 }, cancelText: { fontSize: 14 },
  confirmBtn: { borderRadius: 12, overflow: 'hidden' }, confirmGrad: { paddingHorizontal: 20, paddingVertical: 12 },
  confirmText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
