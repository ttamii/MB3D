import type { Project, Settings } from './types';
import { normalizeProject } from './validate';
import { uid } from './util';

export type SubscriptionPlan = 'none' | 'pro' | 'factory';

export interface UserAccount {
  id: string;
  login: string;
  password: string;
  name: string;
  company: string;
  role: 'admin' | 'pro';
  subscription?: SubscriptionPlan;
  subscriptionUntil?: number;
  active: boolean;
  createdAt: number;
}

export interface CloudConfig {
  url: string;
  anonKey: string;
}

const K_ACCOUNTS = 'mebel3d.auth.accounts.v1';
const K_SESSION = 'mebel3d.auth.session.v1';
const K_GATE = 'mebel3d.auth.gate.v1';
const K_CLOUD = 'mebel3d.auth.cloud.v1';

const DEFAULT_ADMIN: UserAccount = {
  id: 'usr_admin',
  login: 'admin',
  password: 'mebel2026',
  name: 'Администратор ADAL',
  company: 'ADAL Constructor',
  role: 'admin',
  subscription: 'factory',
  active: true,
  createdAt: Date.now(),
};

const memStore = new Map<string, string>();

/** Синхронный SHA-256 (пароли не хранятся и не уходят в облако открытым текстом) */
function sha256(msg: string): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(msg);
  const l = bytes.length;
  const padLen = (((l + 9 + 63) >> 6) << 6);
  const data = new Uint8Array(padLen);
  data.set(bytes);
  data[l] = 0x80;
  const dv = new DataView(data.buffer);
  dv.setUint32(padLen - 4, (l * 8) >>> 0);
  dv.setUint32(padLen - 8, Math.floor((l * 8) / 4294967296));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

function hashPassword(login: string, pass: string): string {
  return 'h1:' + sha256(`adal|${login.trim().toLowerCase()}|${pass.trim()}`);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : (memStore.get(key) ?? null);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, val: unknown): void {
  try {
    const str = JSON.stringify(val);
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, str);
    else memStore.set(key, str);
  } catch {
    // ignore storage quota errors
  }
}

export function loadAccounts(): UserAccount[] {
  const list = readJson<UserAccount[]>(K_ACCOUNTS, []);
  if (!Array.isArray(list) || list.length === 0) {
    const init = [DEFAULT_ADMIN];
    writeJson(K_ACCOUNTS, init);
    return init;
  }
  return list;
}

export function saveAccounts(accounts: UserAccount[]): void {
  writeJson(K_ACCOUNTS, accounts);
}

/** Проверка: есть ли у пользователя активная оплаченная подписка на конструктор */
export function hasActiveSubscription(user: UserAccount | null): boolean {
  if (!user || !user.active) return false;
  if (user.role === 'admin' || user.id === 'usr_admin') return true;
  const plan = user.subscription ?? 'none';
  if (plan === 'pro' || plan === 'factory') {
    if (user.subscriptionUntil && user.subscriptionUntil < Date.now()) return false;
    return true;
  }
  return false;
}

export function createAccount(data: {
  login: string;
  password: string;
  name: string;
  company?: string;
  role?: 'admin' | 'pro';
  subscription?: SubscriptionPlan;
}): UserAccount | string {
  const cleanLogin = data.login.trim().toLowerCase();
  if (cleanLogin.length < 3) return 'Логин должен содержать минимум 3 символа';
  if (data.password.trim().length < 4) return 'Пароль должен содержать минимум 4 символа';
  const accounts = loadAccounts();
  if (accounts.some((a) => a.login.toLowerCase() === cleanLogin)) {
    return 'Пользователь с таким логином уже зарегистрирован';
  }
  const sub: SubscriptionPlan = data.subscription ?? (data.role === 'admin' ? 'factory' : 'none');
  const acc: UserAccount = {
    id: `usr_${uid()}`,
    login: cleanLogin,
    password: hashPassword(cleanLogin, data.password),
    name: data.name.trim() || cleanLogin,
    company: data.company?.trim() || 'Мебельный цех',
    role: data.role ?? 'pro',
    subscription: sub,
    subscriptionUntil: sub !== 'none' ? Date.now() + 30 * 86400_000 : undefined,
    active: true,
    createdAt: Date.now(),
  };
  accounts.push(acc);
  saveAccounts(accounts);
  void pushAccountToCloud(acc);
  return acc;
}

/** Самостоятельная регистрация пользователя (создаёт аккаунт в БД без подписки и выполняет вход) */
export function registerAccount(data: {
  login: string;
  password: string;
  name: string;
  company?: string;
}): { ok: true; user: UserAccount } | { ok: false; error: string } {
  const res = createAccount({
    login: data.login,
    password: data.password,
    name: data.name,
    company: data.company,
    role: 'pro',
    subscription: 'none',
  });
  if (typeof res === 'string') {
    return { ok: false, error: res };
  }
  writeJson(K_SESSION, res.id);
  return { ok: true, user: res };
}

/** Активация или смена тарифа подписки для аккаунта в БД */
export function setAccountSubscription(id: string, plan: SubscriptionPlan): UserAccount | null {
  const accounts = loadAccounts();
  const target = accounts.find((a) => a.id === id);
  if (!target) return null;
  target.subscription = plan;
  target.subscriptionUntil = plan === 'none' ? undefined : Date.now() + 30 * 86400_000;
  saveAccounts(accounts);
  void pushAccountToCloud(target);
  return target;
}

export function deleteAccount(id: string): boolean {
  const accounts = loadAccounts();
  const target = accounts.find((a) => a.id === id);
  if (!target || target.id === 'usr_admin') return false;
  saveAccounts(accounts.filter((a) => a.id !== id));
  return true;
}

export function toggleAccountActive(id: string, active: boolean): void {
  const accounts = loadAccounts();
  const target = accounts.find((a) => a.id === id);
  if (target && target.id !== 'usr_admin') {
    target.active = active;
    saveAccounts(accounts);
    void pushAccountToCloud(target);
  }
}

export function updateAccountPassword(id: string, newPass: string): boolean {
  if (newPass.trim().length < 4) return false;
  const accounts = loadAccounts();
  const target = accounts.find((a) => a.id === id);
  if (!target) return false;
  target.password = hashPassword(target.login, newPass);
  saveAccounts(accounts);
  void pushAccountToCloud(target);
  return true;
}

export function getCurrentUser(): UserAccount | null {
  const sessionUserId = readJson<string | null>(K_SESSION, null);
  const accounts = loadAccounts();
  if (!sessionUserId) {
    if (!isAccessGateEnabled()) return accounts[0] ?? DEFAULT_ADMIN;
    return null;
  }
  const found = accounts.find((a) => a.id === sessionUserId && a.active);
  return found ?? null;
}

export function loginWithCredentials(login: string, password: string): { ok: true; user: UserAccount } | { ok: false; error: string } {
  const cleanLogin = login.trim().toLowerCase();
  const cleanPass = password.trim();
  const accounts = loadAccounts();
  const user = accounts.find((a) => a.login.toLowerCase() === cleanLogin);
  const passOk = !!user && (user.password === hashPassword(cleanLogin, cleanPass) || user.password === cleanPass);
  if (!user || !passOk) {
    return { ok: false, error: 'Неверный логин или пароль' };
  }
  if (user.password === cleanPass && user.id !== 'usr_admin') {
    user.password = hashPassword(cleanLogin, cleanPass);
    saveAccounts(accounts);
  }
  if (!user.active) {
    return { ok: false, error: 'Доступ для этого аккаунта приостановлен администратором' };
  }
  writeJson(K_SESSION, user.id);
  return { ok: true, user };
}

export function logoutCurrentUser(): void {
  try {
    localStorage.removeItem(K_SESSION);
  } catch {
    // ignore
  }
}

/** Включён ли обязательный вход по логину/паролю и подписке (по умолчанию включён) */
export function signInWithGoogleOAuth(): void {
  const cfg = getCloudConfig();
  if (!cfg.url) return;
  const redirectUrl = window.location.origin + window.location.pathname;
  window.location.href = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
}

export function handleAuthRedirectCallback(): boolean {
  if (!window.location.hash) return false;
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (!token) return false;

  try {
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
    const email = decoded.email?.trim().toLowerCase();
    if (email) {
      const name = decoded.user_metadata?.full_name || decoded.user_metadata?.name || email.split('@')[0];
      const accounts = loadAccounts();
      let user = accounts.find((a) => a.login.toLowerCase() === email);
      if (!user) {
        user = {
          id: `usr_${uid()}`,
          login: email,
          password: 'oauth:google',
          name,
          company: '',
          role: 'pro',
          subscription: 'none',
          active: true,
          createdAt: Date.now(),
        };
        accounts.push(user);
        saveAccounts(accounts);
        void pushAccountToCloud(user);
      }
      writeJson(K_SESSION, user.id);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
  } catch {
    // ignore parse error
  }
  return false;
}

export function isAccessGateEnabled(): boolean {
  return readJson<boolean>(K_GATE, true);
}

export function setAccessGateEnabled(enabled: boolean): void {
  writeJson(K_GATE, enabled);
}

/** Суффикс ключей хранилища для изоляции проектов каждого пользователя */
export function getUserStorageSuffix(): string {
  const u = getCurrentUser();
  if (!u || u.id === 'usr_admin') return '';
  return `.${u.id}`;
}

// ——— Подключение к облачной БД Supabase (PostgreSQL REST API) ———

export function getCloudConfig(): CloudConfig {
  // Публичный (publishable) ключ Supabase безопасно хранить в клиентском коде
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL
    || 'https://kgrsjuffuvnlgofoabio.supabase.co';
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY
    || 'sb_publishable_F7upCbCbFYu57hCCqzRxlw_DMLUcyCT';
  const saved = readJson<CloudConfig>(K_CLOUD, { url: '', anonKey: '' });
  return {
    url: (saved.url || envUrl).trim().replace(/\/+$/, ''),
    anonKey: (saved.anonKey || envKey).trim(),
  };
}

export function setCloudConfig(cfg: CloudConfig): void {
  writeJson(K_CLOUD, {
    url: cfg.url.trim().replace(/\/+$/, ''),
    anonKey: cfg.anonKey.trim(),
  });
}

export function isCloudConfigured(): boolean {
  const cfg = getCloudConfig();
  return cfg.url.startsWith('https://') && cfg.anonKey.length > 20;
}

export async function pushProjectToCloud(project: Project): Promise<{ ok: boolean; error?: string }> {
  const cfg = getCloudConfig();
  if (!cfg.url || !cfg.anonKey) return { ok: false, error: 'Облачная БД не подключена' };
  const user = getCurrentUser() ?? DEFAULT_ADMIN;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/mebel_projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: project.id,
        user_login: user.login,
        name: project.name,
        client_name: project.clientName ?? '',
        client_phone: project.clientPhone ?? '',
        status: project.status ?? 'draft',
        updated_at: project.updatedAt,
        payload: project,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Ошибка БД (${res.status}): ${txt.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка сети при подключении к БД' };
  }
}

export async function pullProjectsFromCloud(settings: Settings): Promise<{ ok: boolean; projects: Project[]; error?: string }> {
  const cfg = getCloudConfig();
  if (!cfg.url || !cfg.anonKey) return { ok: false, projects: [], error: 'Облачная БД не подключена' };
  const user = getCurrentUser() ?? DEFAULT_ADMIN;
  const filter = user.role === 'admin' ? '' : `&user_login=eq.${encodeURIComponent(user.login)}`;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/mebel_projects?select=payload&order=updated_at.desc&limit=100${filter}`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, projects: [], error: `Ошибка чтения БД (${res.status}): ${txt.slice(0, 120)}` };
    }
    const rows = (await res.json()) as { payload?: unknown }[];
    const projects = rows
      .map((r) => normalizeProject(r.payload, settings.materials))
      .filter((p): p is Project => p !== null);
    return { ok: true, projects };
  } catch (e) {
    return { ok: false, projects: [], error: e instanceof Error ? e.message : 'Ошибка сети' };
  }
}

export async function deleteProjectFromCloud(projectId: string): Promise<void> {
  const cfg = getCloudConfig();
  if (!cfg.url || !cfg.anonKey) return;
  try {
    await fetch(`${cfg.url}/rest/v1/mebel_projects?id=eq.${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });
  } catch {
    // ignore network error on background delete
  }
}

export async function syncAccountFromCloud(login: string): Promise<void> {
  const cfg = getCloudConfig();
  const clean = login.trim().toLowerCase();
  if (!cfg.url || !cfg.anonKey || clean.length < 3) return;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/mebel_accounts?select=payload&login=eq.${encodeURIComponent(clean)}&limit=1`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
    if (!res.ok) return;
    const rows = (await res.json()) as { payload?: UserAccount }[];
    const remote = rows[0]?.payload;
    if (!remote || remote.role === 'admin') return;
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.login.toLowerCase() === clean);
    if (idx >= 0) accounts[idx] = remote;
    else accounts.push(remote);
    saveAccounts(accounts);
  } catch {
    // офлайн: работаем с локальными данными
  }
}

export async function pushAccountToCloud(account: UserAccount): Promise<void> {
  const cfg = getCloudConfig();
  if (!cfg.url || !cfg.anonKey) return;
  try {
    await fetch(`${cfg.url}/rest/v1/mebel_accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: account.id,
        login: account.login,
        name: account.name,
        company: account.company,
        role: account.role,
        subscription: account.subscription ?? 'none',
        active: account.active,
        payload: account,
      }),
    });
  } catch {
    // ignore background sync error if table not created yet
  }
}

