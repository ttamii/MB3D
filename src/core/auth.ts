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
    password: data.password.trim(),
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
  target.password = newPass.trim();
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
  if (!user || user.password !== cleanPass) {
    return { ok: false, error: 'Неверный логин или пароль' };
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
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? '';
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY ?? '';
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

