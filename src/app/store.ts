import type { Module, Project, Settings } from '../core/types';
import { defaultProject, PRESETS, isWall } from '../core/defaults';
import { buildModule } from '../core/geometry';
import { loadCurrent, loadSettings, saveCurrent, saveSettings } from '../core/storage';
import { normalizeModule, normalizeProject, normalizeSettings } from '../core/validate';
import { debounce, uid } from '../core/util';

export type Change = 'project' | 'select' | 'settings';

export class Store {
  project: Project;
  settings: Settings;
  selectedId: string | null = null;
  readOnly = false;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastKey = '';
  private lastAt = 0;
  private listeners = new Set<(c: Change) => void>();
  private persist = debounce(() => {
    if (this.readOnly) return;
    const ok = saveCurrent(this.project);
    this.onStorageError(!ok);
  }, 350);
  onStorageError: (failed: boolean) => void = () => {};

  constructor() {
    this.settings = loadSettings();
    this.project = loadCurrent(this.settings) ?? defaultProject();
    if (!this.project.modules.length) this.project = defaultProject();
    this.selectedId = this.project.modules[0]?.id ?? null;
  }

  subscribe(fn: (c: Change) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: Change): void {
    this.listeners.forEach((l) => l(c));
  }

  get selected(): Module | null {
    return this.project.modules.find((m) => m.id === this.selectedId) ?? null;
  }

  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit('select');
  }

  /** Изменение проекта. coalesce — ключ для склейки быстрых правок в один шаг undo. */
  commit(mutator: (p: Project) => void, coalesce = ''): void {
    if (this.readOnly) return;
    const now = performance.now();
    const snap = JSON.stringify(this.project);
    if (!(coalesce && coalesce === this.lastKey && now - this.lastAt < 900)) {
      this.undoStack.push(snap);
      if (this.undoStack.length > 80) this.undoStack.shift();
    }
    this.lastKey = coalesce;
    this.lastAt = now;
    this.redoStack = [];
    mutator(this.project);
    this.project.modules = this.project.modules.map((m) => normalizeModule(m, this.settings.materials));
    this.project.updatedAt = Date.now();
    if (this.selectedId && !this.project.modules.some((m) => m.id === this.selectedId)) {
      this.selectedId = this.project.modules[0]?.id ?? null;
    }
    this.emit('project');
    this.persist();
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.restore(s);
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.restore(s);
  }

  private restore(json: string): void {
    const p = normalizeProject(JSON.parse(json), this.settings.materials);
    if (!p) return;
    this.project = p;
    if (!p.modules.some((m) => m.id === this.selectedId)) this.selectedId = p.modules[0]?.id ?? null;
    this.lastKey = '';
    this.emit('project');
    this.persist();
  }

  loadProject(p: Project): void {
    this.undoStack = [];
    this.redoStack = [];
    this.project = p;
    this.selectedId = p.modules[0]?.id ?? null;
    this.emit('project');
    this.persist();
  }

  newProject(): void {
    this.loadProject({ v: 1, id: uid(), name: 'Новый проект', updatedAt: Date.now(), modules: [] });
  }

  setSettings(raw: unknown): void {
    this.settings = normalizeSettings(raw);
    saveSettings(this.settings);
    this.project.modules = this.project.modules.map((m) => normalizeModule(m, this.settings.materials));
    this.emit('settings');
    this.emit('project');
  }

  addPreset(id: string): void {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const m = preset.make();
    // ставим справа от последнего модуля того же яруса
    let x = 0;
    for (const o of this.project.modules) {
      const sameTier = isWall(m.kind)
        ? (isWall(o.kind) && Math.abs(o.lift - m.lift) < 300)
        : (!isWall(o.kind) && (m.kind === 'tall' ? o.kind === 'tall' : o.kind !== 'tall'));
      if (sameTier) x = Math.max(x, o.x + buildModule(o).width);
    }
    m.x = x;
    this.commit((p) => p.modules.push(m));
    this.select(m.id);
  }

  duplicate(id: string): void {
    const src = this.project.modules.find((m) => m.id === id);
    if (!src) return;
    const copy: Module = structuredClone(src);
    copy.id = uid();
    copy.name = src.name + ' (копия)';
    copy.x = src.x + buildModule(src).width;
    this.commit((p) => {
      const i = p.modules.findIndex((m) => m.id === id);
      p.modules.splice(i + 1, 0, copy);
    });
    this.select(copy.id);
  }

  remove(id: string): void {
    this.commit((p) => {
      p.modules = p.modules.filter((m) => m.id !== id);
    });
  }

  move(id: string, dir: -1 | 1): void {
    this.commit((p) => {
      const i = p.modules.findIndex((m) => m.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.modules.length) return;
      [p.modules[i], p.modules[j]] = [p.modules[j], p.modules[i]];
    });
  }

  /** Выстроить модули в ряд слева направо с раздельным позиционированием ярусов (пеналы, низ, навесные, антресоли). */
  autoLayout(): void {
    this.commit((p) => {
      const isTall = (m: Module) => m.kind === 'tall' || m.kind === 'wardrobe' || (m.h >= 1800 && m.lift === 0);
      const isBase = (m: Module) => !isTall(m) && !isWall(m.kind);
      const isMidWall = (m: Module) => isWall(m.kind) && m.lift < 1900;
      const isMezz = (m: Module) => isWall(m.kind) && m.lift >= 1900;

      const tall = p.modules.filter(isTall);
      const base = p.modules.filter(isBase);
      const mid = p.modules.filter(isMidWall);
      const mezz = p.modules.filter(isMezz);

      const avgBaseX = base.length > 0 ? base.reduce((s, m) => s + m.x, 0) / base.length : 1000;
      const tallLeft = tall.filter((m) => m.x < avgBaseX);
      const tallRight = tall.filter((m) => m.x >= avgBaseX);

      const byX = (a: Module, b: Module) => a.x - b.x;
      tallLeft.sort(byX);
      tallRight.sort(byX);
      base.sort(byX);
      mid.sort(byX);
      mezz.sort(byX);

      let xTallL = 0;
      for (const m of tallLeft) {
        m.x = xTallL;
        xTallL += buildModule(m).width;
      }

      const startWorkX = xTallL;

      let xB = startWorkX;
      for (const m of base) {
        m.x = xB;
        xB += buildModule(m).width;
      }

      let xM = startWorkX;
      for (const m of mid) {
        m.x = xM;
        xM += buildModule(m).width;
      }

      let xZ = startWorkX;
      for (const m of mezz) {
        m.x = xZ;
        xZ += buildModule(m).width;
      }

      let xTallR = Math.max(xB, xM, xZ);
      for (const m of tallRight) {
        m.x = xTallR;
        xTallR += buildModule(m).width;
      }
    });
  }
}
