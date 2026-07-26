import { API_URL } from '../config';
import * as local from './localstore';

let _userId: string | null = null;

export function setUserId(id: string | null) {
  _userId = id;
}

function uid(): string {
  if (!_userId) throw new Error('Not authenticated');
  return _userId;
}

export async function registerUser(clerkId: string, email: string, name: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkId, email, name }),
    });
  } catch { console.warn('registerUser: server unreachable'); }
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

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function deviceToLocal(d: any): Device {
  return { id: d.id, name: d.name, mac_address: d.mac_address || d.macAddress, cluster_id: d.cluster_id ?? d.clusterId ?? null, created_at: d.created_at || d.createdAt || new Date().toISOString() };
}

function clusterToLocal(c: any): Cluster {
  return { id: c.id, name: c.name, description: c.description, created_at: c.created_at || c.createdAt || new Date().toISOString() };
}

async function syncDevices(): Promise<void> {
  const id = _userId;
  if (!id) return;
  try {
    const res = await fetch(`${API_URL}/api/devices?userId=${id}`);
    if (res.ok) {
      const data = await res.json();
      for (const d of data) await local.saveDevice(deviceToLocal(d));
    }
  } catch { console.warn('syncDevices: server unreachable'); }
}

async function syncClusters(): Promise<void> {
  const id = _userId;
  if (!id) return;
  try {
    const res = await fetch(`${API_URL}/api/clusters?userId=${id}`);
    if (res.ok) {
      const data = await res.json();
      for (const c of data) await local.saveCluster(clusterToLocal(c));
    }
  } catch { console.warn('syncClusters: server unreachable'); }
}

export const devices = {
  list: async (): Promise<Device[]> => {
    const data = await local.listDevices();
    if (data.length === 0) await syncDevices();
    return data.length > 0 ? data : local.listDevices();
  },

  add: async (data: { name: string; macAddress: string; clusterId?: string }): Promise<Device> => {
    const device: Device = {
      id: genId(), name: data.name, mac_address: data.macAddress,
      cluster_id: data.clusterId ?? null, created_at: new Date().toISOString(),
    };
    await local.saveDevice(device);

    const id = _userId;
    if (id) {
      fetch(`${API_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, name: data.name, macAddress: data.macAddress, clusterId: data.clusterId ?? null }),
      }).catch(() => {});
    }
    return device;
  },

  remove: async (roverId: string): Promise<void> => {
    await local.removeDevice(roverId);
    const id = _userId;
    if (id) {
      fetch(`${API_URL}/api/devices/${roverId}?userId=${id}`, { method: 'DELETE' }).catch(() => {});
    }
  },

  get: async (roverId: string): Promise<Device | undefined> => {
    const list = await local.listDevices();
    return list.find(d => d.id === roverId);
  },
};

export const clusters = {
  list: async (): Promise<Cluster[]> => {
    const data = await local.listClusters();
    if (data.length === 0) await syncClusters();
    return data.length > 0 ? data : local.listClusters();
  },

  create: async (data: { name: string; description: string }): Promise<Cluster> => {
    const cluster: Cluster = {
      id: genId(), name: data.name, description: data.description, created_at: new Date().toISOString(),
    };
    await local.saveCluster(cluster);

    const id = _userId;
    if (id) {
      fetch(`${API_URL}/api/clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, name: data.name, description: data.description }),
      }).catch(() => {});
    }
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
