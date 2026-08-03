import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Modal, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { clusters as clustersApi } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type, elevation } from '../theme';
import { Screen, ScreenHeader, IconButton, Field, Button, Press, FadeIn, EmptyState } from '../components/ui';
import { useToast } from '../components/Toast';
import { Skeleton } from '../components/Skeleton';
import { ClusterArt } from '../components/Illustrations';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Clusters'>;
interface Cluster { id: string; name: string; description: string }

export default function ClustersScreen() {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [clusterList, setClusterList] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const load = useCallback(async () => {
    try {
      setClusterList((await clustersApi.list()) || []);
    } catch (e) {
      console.warn('clusters: fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const closeModal = () => {
    setModalVisible(false);
    setNewName('');
    setNewDesc('');
    setNameError('');
  };

  const create = async () => {
    if (!newName.trim()) {
      setNameError('Name this cluster');
      return;
    }
    setSaving(true);
    const label = newName.trim();
    try {
      await clustersApi.create({ name: label, description: newDesc.trim() });
      closeModal();
      load();
      toast.success(`Cluster “${label}” created`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Could not create that cluster');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Clusters"
        subtitle={loading ? undefined : `${clusterList.length} group${clusterList.length === 1 ? '' : 's'}`}
        onBack={() => nav.goBack()}
        right={<IconButton icon="plus" onPress={() => setModalVisible(true)} label="New cluster" />}
      />

      {loading ? (
        <View style={{ padding: rem(spacing.xl), gap: rem(spacing.md) }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                padding: rem(spacing.lg), backgroundColor: theme.surface,
                borderRadius: radii.xl, borderWidth: 1, borderColor: theme.border,
              }}
            >
              <Skeleton width={rem(44)} height={rem(44)} radius={radii.md} />
              <View style={{ flex: 1, gap: rem(7) }}>
                <Skeleton width="45%" height={rem(14)} radius={6} />
                <Skeleton width="70%" height={rem(10)} radius={5} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={clusterList}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: rem(spacing.xl),
            paddingBottom: insets.bottom + rem(spacing.xxl),
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: rem(spacing.md) }} />}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                art={<ClusterArt size={rem(180)} />}
                title="Nothing grouped yet"
                body="Clusters let you send one command to every rover working the same block."
                actionLabel="Create a cluster"
                onAction={() => setModalVisible(true)}
              />
            </View>
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                  padding: rem(spacing.lg), backgroundColor: theme.surface,
                  borderRadius: radii.xl, borderWidth: 1, borderColor: theme.border,
                }}
              >
                <View
                  style={{
                    width: rem(44), height: rem(44), borderRadius: radii.md,
                    backgroundColor: theme.accentDim, alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name="sitemap-outline" size={rem(21)} color={theme.accentTint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...type.subheading, color: theme.text }} numberOfLines={1}>{item.name}</Text>
                  {!!item.description && (
                    <Text style={{ ...type.caption, color: theme.textDim, marginTop: 2 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                </View>
              </View>
            </FadeIn>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: theme.scrim, justifyContent: 'center', padding: rem(spacing.xl) }}
            onPress={closeModal}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.surface,
                borderRadius: radii.xxl,
                borderWidth: 1,
                borderColor: theme.border,
                padding: rem(spacing.xl),
                gap: rem(18),
                ...elevation(theme.shadow, 3),
              }}
            >
              <View>
                <Text style={{ ...type.heading, color: theme.text }}>New cluster</Text>
                <Text style={{ ...type.caption, color: theme.textDim, marginTop: 2 }}>
                  Group rovers that work the same ground.
                </Text>
              </View>

              <Field
                label="Name"
                value={newName}
                onChangeText={(t) => { setNewName(t); if (nameError) setNameError(''); }}
                placeholder="North block"
                autoCapitalize="words"
                error={nameError}
              />
              <Field
                label="Description"
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Optional — what this group covers"
                autoCapitalize="words"
              />

              <View style={{ flexDirection: 'row', gap: rem(spacing.md), marginTop: rem(spacing.xs) }}>
                <Press onPress={closeModal} style={{ flex: 1 }}>
                  <View
                    style={{
                      minHeight: 52, borderRadius: radii.lg, borderWidth: 1,
                      borderColor: theme.borderStrong, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: rem(15), fontWeight: '600', color: theme.textSecondary }}>Cancel</Text>
                  </View>
                </Press>
                <Button label="Create" onPress={create} loading={saving} style={{ flex: 1 }} full={false} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
