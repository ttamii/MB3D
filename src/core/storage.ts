import { DEFAULT_SETTINGS } from './defaults';
import { deleteProjectFromCloud, getUserStorageSuffix, isCloudConfigured, pullProjectsFromCloud, pushProjectToCloud } from './auth';
import type { Project, Settings } from './types';
import { normalizeProject, normalizeSettings } from './validate';

const K_SETTINGS = 'mebel3d.settings.v1';
const K_CURRENT = 'mebel3d.current.v1';
const K_LIB = 'mebel3d.projects.v1';
const MAX_IMPORT = 2_000_000;

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** Возвращает false, если хранилище переполнено/недоступно. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const raw = read(K_SETTINGS);
  return raw ? normalizeSettings(raw) : structuredClone(DEFAULT_SETTINGS);
}
export const saveSettings = (s: Settings) => write(K_SETTINGS, s);

export function loadCurrent(settings: Settings): Project | null {
  return normalizeProject(read(K_CURRENT + getUserStorageSuffix()), settings.materials);
}
export const saveCurrent = (p: Project) => write(K_CURRENT + getUserStorageSuffix(), p);

export function loadLibrary(settings: Settings): Project[] {
  const raw = read(K_LIB + getUserStorageSuffix());
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => normalizeProject(p, settings.materials))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveToLibrary(p: Project, settings: Settings): boolean {
  const key = K_LIB + getUserStorageSuffix();
  const updated = { ...p, updatedAt: Date.now() };
  const lib = loadLibrary(settings).filter((x) => x.id !== p.id);
  lib.unshift(updated);
  const ok = write(key, lib.slice(0, 100));
  if (isCloudConfigured()) {
    void pushProjectToCloud(updated);
  }
  return ok;
}

export function deleteFromLibrary(id: string, settings: Settings): void {
  const key = K_LIB + getUserStorageSuffix();
  write(key, loadLibrary(settings).filter((x) => x.id !== id));
  if (isCloudConfigured()) {
    void deleteProjectFromCloud(id);
  }
}

export async function syncCloudLibraryToLocal(settings: Settings): Promise<number> {
  if (!isCloudConfigured()) return 0;
  const res = await pullProjectsFromCloud(settings);
  if (!res.ok || !res.projects.length) return 0;
  const key = K_LIB + getUserStorageSuffix();
  const localArr = loadLibrary(settings);
  const byId = new Map<string, Project>();
  localArr.forEach((p) => byId.set(p.id, p));
  let addedOrUpdated = 0;
  for (const norm of res.projects) {
    const prev = byId.get(norm.id);
    if (!prev || norm.updatedAt > prev.updatedAt) {
      byId.set(norm.id, norm);
      addedOrUpdated++;
    }
  }
  const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  write(key, merged);
  return addedOrUpdated;
}

export function projectToJson(p: Project): string {
  return JSON.stringify({ app: 'mebel3d', ...p }, null, 2);
}

export function projectFromJson(text: string, settings: Settings): Project | null {
  if (text.length > MAX_IMPORT) return null;
  try {
    return normalizeProject(JSON.parse(text), settings.materials);
  } catch {
    return null;
  }
}

// ——— Ссылка для клиента (данные в #hash, без сервера) ———

const b64u = {
  enc(bytes: Uint8Array): string {
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str: string): Uint8Array {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export interface SharePayload {
  p: Project;
  c: { name: string; phone: string };
}

export async function encodeShare(p: Project, settings: Settings): Promise<string> {
  const payload: SharePayload = { p, c: { name: settings.company.name, phone: settings.company.phone } };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const packed = typeof CompressionStream !== 'undefined' ? await pipe(raw, new CompressionStream('deflate-raw')) : raw;
  return (typeof CompressionStream !== 'undefined' ? 'z' : 'r') + b64u.enc(packed);
}

export async function decodeShare(hash: string, settings: Settings): Promise<{ project: Project; company: { name: string; phone: string } } | null> {
  try {
    if (hash.length > 400_000) return null;
    const mode = hash[0];
    let bytes = b64u.dec(hash.slice(1));
    if (mode === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (mode !== 'r') return null;
    if (bytes.length > MAX_IMPORT) return null;
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const project = normalizeProject(obj.p, settings.materials);
    if (!project) return null;
    const c = (obj.c ?? {}) as Record<string, unknown>;
    return {
      project,
      company: {
        name: typeof c.name === 'string' ? c.name.slice(0, 60) : '',
        phone: typeof c.phone === 'string' ? c.phone.slice(0, 30) : '',
      },
    };
  } catch {
    return null;
  }
}
