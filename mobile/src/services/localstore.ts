import * as FileSystem from 'expo-file-system';

let BASE: string | null = null;
const DEVICES_DIR = () => `${baseDir()}devices/`;
const CLUSTERS_DIR = () => `${baseDir()}clusters/`;
const INDEX_FILE = () => `${baseDir()}index.json`;

function baseDir(): string {
  if (BASE) return BASE;
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('FileSystem.documentDirectory is null/undefined');
  BASE = `${docDir}AgriverseROVER/`;
  return BASE;
}

interface StoreIndex {
  devices: string[];
  clusters: string[];
}

async function ensureDirs(): Promise<void> {
  for (const dir of [baseDir(), DEVICES_DIR(), CLUSTERS_DIR()]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readIndex(): Promise<StoreIndex> {
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX_FILE());
    return JSON.parse(raw);
  } catch {
    return { devices: [], clusters: [] };
  }
}

async function writeIndex(idx: StoreIndex): Promise<void> {
  await FileSystem.writeAsStringAsync(INDEX_FILE(), JSON.stringify(idx));
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function initStore(): Promise<void> {
  await ensureDirs();
}

export async function saveDevice(device: { id: string; name: string; mac_address: string; cluster_id: string | null; created_at: string }): Promise<void> {
  await ensureDirs();
  const idx = await readIndex();
  const path = `${DEVICES_DIR()}${sanitizeId(device.id)}.json`;

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
  await ensureDirs();
  const idx = await readIndex();
  const path = `${DEVICES_DIR()}${sanitizeId(id)}.json`;

  idx.devices = idx.devices.filter(d => d !== id);

  await Promise.all([
    FileSystem.deleteAsync(path, { idempotent: true }),
    writeIndex(idx),
  ]);
}

export async function listDevices(): Promise<any[]> {
  await ensureDirs();
  const idx = await readIndex();
  const results = await Promise.allSettled(
    idx.devices.map(id => FileSystem.readAsStringAsync(`${DEVICES_DIR()}${sanitizeId(id)}.json`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => JSON.parse((r as PromiseFulfilledResult<string>).value));
}

export async function saveCluster(cluster: { id: string; name: string; description: string; created_at: string }): Promise<void> {
  await ensureDirs();
  const idx = await readIndex();
  const path = `${CLUSTERS_DIR()}${sanitizeId(cluster.id)}.json`;

  if (!idx.clusters.includes(cluster.id)) {
    idx.clusters.unshift(cluster.id);
  }

  await Promise.all([
    FileSystem.writeAsStringAsync(path, JSON.stringify(cluster)),
    writeIndex(idx),
  ]);
}

export async function listClusters(): Promise<any[]> {
  await ensureDirs();
  const idx = await readIndex();
  const results = await Promise.allSettled(
    idx.clusters.map(id => FileSystem.readAsStringAsync(`${CLUSTERS_DIR()}${sanitizeId(id)}.json`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => JSON.parse((r as PromiseFulfilledResult<string>).value));
}

export async function clearAll(): Promise<void> {
  try {
    await FileSystem.deleteAsync(baseDir(), { idempotent: true });
  } catch {}
}
