import * as FileSystem from 'expo-file-system';

const docDir = FileSystem.documentDirectory;
const HAS_FS = !!docDir;

const BASE = HAS_FS ? `${docDir}AgriverseROVER/` : '';
const DEVICES_DIR = `${BASE}devices/`;
const CLUSTERS_DIR = `${BASE}clusters/`;
const INDEX_FILE = `${BASE}index.json`;

interface StoreIndex { devices: string[]; clusters: string[]; }

const memDevices = new Map<string, any>();
const memClusters = new Map<string, any>();
let memIndex: StoreIndex = { devices: [], clusters: [] };

async function ensureDirs(): Promise<void> {
  if (!HAS_FS) return;
  for (const dir of [BASE, DEVICES_DIR, CLUSTERS_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readIndex(): Promise<StoreIndex> {
  if (!HAS_FS) return memIndex;
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX_FILE);
    return JSON.parse(raw);
  } catch { return { devices: [], clusters: [] }; }
}

async function writeIndex(idx: StoreIndex): Promise<void> {
  if (!HAS_FS) { memIndex = idx; return; }
  await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(idx));
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function initStore(): Promise<void> {
  await ensureDirs();
}

export async function saveDevice(device: { id: string; name: string; mac_address: string; cluster_id: string | null; created_at: string }): Promise<void> {
  memDevices.set(device.id, device);
  if (!HAS_FS) {
    if (!memIndex.devices.includes(device.id)) memIndex.devices.unshift(device.id);
    return;
  }
  await ensureDirs();
  const idx = await readIndex();
  const path = `${DEVICES_DIR}${sanitizeId(device.id)}.json`;

  if (!idx.devices.includes(device.id)) {
    idx.devices.unshift(device.id);
  } else {
    const i = idx.devices.indexOf(device.id);
    idx.devices.splice(i, 1);
    idx.devices.unshift(device.id);
  }

  await Promise.all([
    FileSystem.writeAsStringAsync(path, JSON.stringify(device)),
    writeIndex(idx),
  ]);
}

export async function removeDevice(id: string): Promise<void> {
  memDevices.delete(id);
  if (!HAS_FS) {
    memIndex.devices = memIndex.devices.filter(d => d !== id);
    return;
  }
  await ensureDirs();
  const idx = await readIndex();
  const path = `${DEVICES_DIR}${sanitizeId(id)}.json`;

  idx.devices = idx.devices.filter(d => d !== id);

  await Promise.all([
    FileSystem.deleteAsync(path, { idempotent: true }),
    writeIndex(idx),
  ]);
}

export async function listDevices(): Promise<any[]> {
  if (!HAS_FS) return memIndex.devices.map(id => memDevices.get(id)).filter(Boolean);
  await ensureDirs();
  const idx = await readIndex();
  const results = await Promise.allSettled(
    idx.devices.map(id => FileSystem.readAsStringAsync(`${DEVICES_DIR}${sanitizeId(id)}.json`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => JSON.parse((r as PromiseFulfilledResult<string>).value));
}

export async function saveCluster(cluster: { id: string; name: string; description: string; created_at: string }): Promise<void> {
  memClusters.set(cluster.id, cluster);
  if (!HAS_FS) {
    if (!memIndex.clusters.includes(cluster.id)) memIndex.clusters.unshift(cluster.id);
    return;
  }
  await ensureDirs();
  const idx = await readIndex();
  const path = `${CLUSTERS_DIR}${sanitizeId(cluster.id)}.json`;

  if (!idx.clusters.includes(cluster.id)) {
    idx.clusters.unshift(cluster.id);
  }

  await Promise.all([
    FileSystem.writeAsStringAsync(path, JSON.stringify(cluster)),
    writeIndex(idx),
  ]);
}

export async function listClusters(): Promise<any[]> {
  if (!HAS_FS) return memIndex.clusters.map(id => memClusters.get(id)).filter(Boolean);
  await ensureDirs();
  const idx = await readIndex();
  const results = await Promise.allSettled(
    idx.clusters.map(id => FileSystem.readAsStringAsync(`${CLUSTERS_DIR}${sanitizeId(id)}.json`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => JSON.parse((r as PromiseFulfilledResult<string>).value));
}

export async function clearAll(): Promise<void> {
  memDevices.clear();
  memClusters.clear();
  memIndex = { devices: [], clusters: [] };
  if (!HAS_FS) return;
  try {
    await FileSystem.deleteAsync(BASE, { idempotent: true });
  } catch {}
}
