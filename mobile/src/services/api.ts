import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

let _userId: string | null = null;

export function setUserId(id: string | null) {
  _userId = id;
}

function uid(): string {
  if (!_userId) throw new Error('Not authenticated');
  return _userId;
}

function cacheKey(type: string) { return `${type}_${uid()}`; }

export async function registerUser(clerkId: string, email: string, name: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkId, email, name }),
    });
  } catch (e) {
    console.warn('registerUser: server unreachable', e);
  }
}

export interface Device {
  id: string;
  name: string;
  mac_address: string;
  cluster_id: string | null;
  created_at: string;
}

export interface Cluster {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

async function uidSafe(): Promise<string | null> {
  try { return uid(); } catch { return null; }
}

async function loadLocal<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveLocal<T>(key: string, data: T[]): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export const devices = {
  list: async (): Promise<Device[]> => {
    const id = await uidSafe();
    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/devices?userId=${id}`);
        if (res.ok) {
          const data = await res.json();
          await saveLocal(cacheKey('devices'), data);
          return data;
        }
      } catch (e) { console.warn('devices.list: server unreachable, using cache', e); }
    }
    return loadLocal(cacheKey('devices'));
  },

  add: async (data: { name: string; macAddress: string; clusterId?: string }): Promise<Device> => {
    const id = await uidSafe();
    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id, name: data.name, macAddress: data.macAddress, clusterId: data.clusterId ?? null }),
        });
        if (res.ok) {
          const device = await res.json();
          const list = await devices.list();
          list.unshift(device);
          await saveLocal(cacheKey('devices'), list);
          return device;
        }
      } catch (e) { console.warn('devices.add: server unreachable, saving locally', e); }
    }
    const device: Device = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: data.name,
      mac_address: data.macAddress,
      cluster_id: data.clusterId ?? null,
      created_at: new Date().toISOString(),
    };
    const list = await loadLocal(cacheKey('devices'));
    list.unshift(device);
    await saveLocal(cacheKey('devices'), list);
    return device;
  },

  remove: async (roverId: string): Promise<void> => {
    const id = await uidSafe();
    if (id) {
      try { await fetch(`${API_URL}/api/devices/${roverId}?userId=${id}`, { method: 'DELETE' }); }
      catch { console.warn('devices.remove: server unreachable'); }
    }
    const list = await loadLocal(cacheKey('devices'));
    await saveLocal(cacheKey('devices'), list.filter(d => d.id !== roverId));
  },

  get: async (roverId: string): Promise<Device | undefined> => {
    const list = await devices.list();
    return list.find(d => d.id === roverId);
  },
};

export const clusters = {
  list: async (): Promise<Cluster[]> => {
    const id = await uidSafe();
    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/clusters?userId=${id}`);
        if (res.ok) {
          const data = await res.json();
          await saveLocal(cacheKey('clusters'), data);
          return data;
        }
      } catch (e) { console.warn('clusters.list: server unreachable, using cache', e); }
    }
    return loadLocal(cacheKey('clusters'));
  },

  create: async (data: { name: string; description: string }): Promise<Cluster> => {
    const id = await uidSafe();
    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/clusters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id, name: data.name, description: data.description }),
        });
        if (res.ok) {
          const cluster = await res.json();
          const list = await clusters.list();
          list.unshift(cluster);
          await saveLocal(cacheKey('clusters'), list);
          return cluster;
        }
      } catch (e) { console.warn('clusters.create: server unreachable, saving locally', e); }
    }
    const cluster: Cluster = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: data.name,
      description: data.description,
      created_at: new Date().toISOString(),
    };
    const list = await loadLocal(cacheKey('clusters'));
    list.unshift(cluster);
    await saveLocal(cacheKey('clusters'), list);
    return cluster;
  },
};

export const stats = {
  get: async () => {
    const [devs, clus] = await Promise.all([devices.list(), clusters.list()]);
    const total = devs.length;
    const clusterCount = clus.length;
    const healthScore = total > 0 ? Math.min(Math.round((total / (total + 1)) * 100), 100) : 0;
    return { total, active: total, inactive: 0, clustersCount: clusterCount, healthScore };
  },
};
