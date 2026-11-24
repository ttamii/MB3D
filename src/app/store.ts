import type { Module, Project, Settings } from '../core/types';
import { defaultProject, PRESETS, isCorner, isWall } from '../core/defaults';
import { DEFAULT_ROOM } from '../core/room';
import { buildModule } from '../core/geometry';
import { getCornerClearanceForWall, modulesOverlapY, verticalOverlap } from '../core/collision';
import { loadCurrent, loadSettings, saveCurrent, saveSettings } from '../core/storage';
import { normalizeModule, normalizeProject, normalizeSettings } from '../core/validate';
import { debounce, uid } from '../core/util';

export type Change = 'project' | 'select' | 'settings';

export class Store {
  project: Project;
  settings: Settings;
  selectedId: string | null = null;
  selectedIds = new Set<string>();
  /** Активная стена для добавления новых модулей из каталога ('back' | 'left' | 'right') */
  activeWall: 'back' | 'left' | 'right' = 'back';
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
    if (this.project.room?.windows?.some((w) => w.id === 'w1')) {
      this.project.room.windows = this.project.room.windows.filter((w) => w.id !== 'w1');
    }
    this.selectedId = this.project.modules[0]?.id ?? null;
    if (this.selectedId) this.selectedIds.add(this.selectedId);
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

  setActiveWall(wall: 'back' | 'left' | 'right'): void {
    if (this.activeWall === wall) return;
    this.activeWall = wall;
    this.emit('select');
  }

  select(id: string | null, additive = false): void {
    if (additive && id) {
      if (this.selectedIds.has(id) && this.selectedIds.size > 1) {
        this.selectedIds.delete(id);
        if (this.selectedId === id) {
          this.selectedId = Array.from(this.selectedIds)[0] ?? null;
        }
      } else {
        this.selectedIds.add(id);
        this.selectedId = id;
      }
      const cur = this.project.modules.find((x) => x.id === this.selectedId);
      if (cur && !isCorner(cur.kind)) this.activeWall = cur.wall ?? 'back';
      this.emit('select');
      return;
    }
    if (this.selectedId === id && this.selectedIds.size <= 1) return;
    this.selectedId = id;
    this.selectedIds.clear();
    if (id) {
      this.selectedIds.add(id);
      const cur = this.project.modules.find((x) => x.id === id);
      if (cur && !isCorner(cur.kind)) this.activeWall = cur.wall ?? 'back';
    }
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
    this.loadProject({
      v: 1,
      id: uid(),
      name: 'Новый проект',
      updatedAt: Date.now(),
      modules: [],
      room: JSON.parse(JSON.stringify(DEFAULT_ROOM)),
    });
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
    const items = preset.group ? preset.group() : [preset.make()];
    const m = items[0];
    const roomW = this.project.room?.w ?? 4500;

    // Перенимаем текущие декоры проекта, чтобы новый модуль сразу попадал в цвет кухни
    const refMod = this.selected ?? this.project.modules[0];
    if (refMod) {
      for (const it of items) {
        it.matCorpus = refMod.matCorpus;
        it.matFacade = refMod.matFacade;
        it.matBack = refMod.matBack;
        it.matTop = refMod.matTop;
        if (refMod.plinthColor) it.plinthColor = refMod.plinthColor;
      }
    }

    // 1. Г-образный или трапециевидный угловой модуль (900×900 / 600×600) всегда ставится строго в угол комнаты!
    if (isCorner(m.kind)) {
      const placeRightCorner = this.activeWall === 'right';
      m.mirror = placeRightCorner;
      delete m.wall;
      m.x = placeRightCorner ? Math.max(0, roomW - m.w) : 0;
      const armZ = m.cornerW2 ?? m.w;

      this.commit((p) => {
        for (const o of p.modules) {
          if (!verticalOverlap(o, m)) continue;
          const ow = o.wall ?? 'back';
          if (!placeRightCorner) {
            // Освобождаем левый угол на задней и левой стенах
            if (ow === 'back' && o.x < m.w) o.x += m.w;
            else if (ow === 'left' && o.x < armZ) o.x += armZ - o.x;
          } else {
            // Освобождаем правый угол
            if (ow === 'back' && o.x + o.w > m.x) o.x = Math.max(0, o.x - m.w);
            else if (ow === 'right' && o.x < armZ) o.x += armZ - o.x;
          }
        }
        p.modules.push(...items);
      });
      this.select(m.id);
      return;
    }

    // 2. Прямой угловой модуль с глухой зоной и L-планкой: ставим сразу в выбранный угол с раздвижкой соседей
    if (m.blindSide) {
      const placeRightCorner = this.activeWall === 'right';
      delete m.wall;
      if (placeRightCorner) {
        m.blindSide = 'right';
        m.hinge = 'left';
        m.x = Math.max(0, roomW - m.w);
      } else {
        m.blindSide = 'left';
        m.x = 0;
      }
      const sideClear = m.d + (m.blindFillerW ?? (isWall(m.kind) ? 40 : 45));
      this.commit((p) => {
        for (const o of p.modules) {
          if (!verticalOverlap(o, m)) continue;
          const ow = o.wall ?? 'back';
          if (!placeRightCorner) {
            if (ow === 'back' && o.x < m.w) o.x += m.w;
            else if (ow === 'left' && o.x < sideClear) o.x += sideClear - o.x;
          } else {
            if (ow === 'back' && o.x + o.w > m.x) o.x = Math.max(0, o.x - m.w);
            else if (ow === 'right' && o.x < sideClear) o.x += sideClear - o.x;
          }
        }
        p.modules.push(...items);
      });
      this.select(m.id);
      return;
    }

    // 3. Обычные модули: ставим на активную стену (activeWall) сразу после угловой зоны или последнего шкафа того же яруса
    const targetWall = this.activeWall;
    items.forEach((it) => {
      if (targetWall === 'back') delete it.wall;
      else it.wall = targetWall;
    });

    const { minStart } = getCornerClearanceForWall(
      this.project.modules,
      targetWall,
      m.lift ?? 0,
      (m.lift ?? 0) + m.h,
      roomW,
    );
    let x = minStart;
    for (const o of this.project.modules) {
      if ((o.wall ?? 'back') !== targetWall) continue;
      if (isCorner(o.kind) && o.mirror && targetWall === 'back') continue;
      const sameTier = isWall(m.kind)
        ? (isWall(o.kind) && Math.abs(o.lift - m.lift) < 280)
        : (!isWall(o.kind));
      if (sameTier) x = Math.max(x, o.x + buildModule(o).width);
    }
    items.forEach((it) => { it.x += x; });
    this.commit((p) => p.modules.push(...items));
    this.select(m.id);
  }

  duplicate(id: string): void {
    const src = this.project.modules.find((m) => m.id === id);
    if (!src) return;
    const copy: Module = structuredClone(src);
    copy.id = uid();
    copy.name = src.name + ' (копия)';
    const copyW = buildModule(src).width;
    copy.x = src.x + copyW;
    this.commit((p) => {
      for (const other of p.modules) {
        if (other.id !== src.id && modulesOverlapY(other, copy) && other.x >= copy.x) {
          other.x += copyW;
        }
      }
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

  /** Выстроить модули в ряд без зазоров раздельно на каждой стене ('back', 'left', 'right') с соблюдением угловых отступов 90°. */
  autoLayout(): void {
    this.commit((p) => {
      const roomW = p.room?.w ?? 4500;
      const isTall = (m: Module) => m.kind === 'tall' || m.kind === 'wardrobe' || (m.h >= 1800 && m.lift === 0);
      const isBase = (m: Module) => !isTall(m) && !isWall(m.kind);
      const isMidWall = (m: Module) => isWall(m.kind) && m.lift < 1900;
      const isMezz = (m: Module) => isWall(m.kind) && m.lift >= 1900;
      const byX = (a: Module, b: Module) => a.x - b.x;

      // 1. Сначала раскладываем заднюю стену ('back')
      const backMods = p.modules.filter((m) => (m.wall ?? 'back') === 'back');
      const leftCorners = backMods.filter((m) => isCorner(m.kind) && !m.mirror);
      const rightCorners = backMods.filter((m) => isCorner(m.kind) && m.mirror);
      for (const lc of leftCorners) lc.x = 0;
      for (const rc of rightCorners) rc.x = Math.max(0, roomW - rc.w);

      const backRegular = backMods.filter((m) => !isCorner(m.kind));
      const tall = backRegular.filter(isTall);
      const base = backRegular.filter(isBase);
      const mid = backRegular.filter(isMidWall);
      const mezz = backRegular.filter(isMezz);

      const leftBaseCornerEnd = leftCorners.some((c) => !isWall(c.kind)) ? Math.max(...leftCorners.filter((c) => !isWall(c.kind)).map((c) => c.w)) : 0;
      const leftWallCornerEnd = leftCorners.some((c) => isWall(c.kind) && c.lift < 1900) ? Math.max(...leftCorners.filter((c) => isWall(c.kind) && c.lift < 1900).map((c) => c.w)) : 0;
      const leftMezzCornerEnd = leftCorners.some((c) => isWall(c.kind) && c.lift >= 1900) ? Math.max(...leftCorners.filter((c) => isWall(c.kind) && c.lift >= 1900).map((c) => c.w)) : 0;

      const avgBaseX = base.length > 0 ? base.reduce((s, m) => s + m.x, 0) / base.length : 1200;
      // Если слева есть угловой шкаф или глухой угол, пеналы на задней стене ставятся справа
      const hasLeftCornerAny = leftCorners.length > 0 || backRegular.some((m) => m.blindSide === 'left');
      const tallLeft = hasLeftCornerAny ? [] : tall.filter((m) => m.x < avgBaseX);
      const tallRight = hasLeftCornerAny ? [...tall] : tall.filter((m) => m.x >= avgBaseX);

      tallLeft.sort(byX);
      tallRight.sort(byX);
      base.sort(byX);
      mid.sort(byX);
      mezz.sort(byX);

      const { minStart: backMinBase } = getCornerClearanceForWall(p.modules, 'back', 0, 860, roomW);
      let xTallL = Math.max(leftBaseCornerEnd, backMinBase);
      for (const m of tallLeft) {
        m.x = xTallL;
        xTallL += buildModule(m).width;
      }

      let xB = Math.max(xTallL, leftBaseCornerEnd);
      for (const m of base) {
        m.x = xB;
        xB += buildModule(m).width;
      }

      let xM = Math.max(xTallL, leftWallCornerEnd);
      for (const m of mid) {
        m.x = xM;
        xM += buildModule(m).width;
      }

      let xZ = Math.max(xTallL, leftMezzCornerEnd);
      for (const m of mezz) {
        m.x = xZ;
        xZ += buildModule(m).width;
      }

      let xTallR = Math.max(xB, xM, xZ);
      for (const m of tallRight) {
        m.x = xTallR;
        xTallR += buildModule(m).width;
      }

      // 2. Затем раскладываем боковые крылья ('left' и 'right') от точной границы угла к краю крыла
      for (const sideWall of ['left', 'right'] as const) {
        const wMods = p.modules.filter((m) => m.wall === sideWall);
        if (!wMods.length) continue;

        const sBase = wMods.filter(isBase).sort(byX);
        const sMid = wMods.filter(isMidWall).sort(byX);
        const sMezz = wMods.filter(isMezz).sort(byX);
        const sTall = wMods.filter(isTall).sort(byX);

        let sbX = getCornerClearanceForWall(p.modules, sideWall, 0, 860, roomW).minStart;
        for (const m of sBase) {
          m.x = sbX;
          sbX += buildModule(m).width;
        }

        let smX = getCornerClearanceForWall(p.modules, sideWall, 1300, 2000, roomW).minStart;
        for (const m of sMid) {
          m.x = smX;
          smX += buildModule(m).width;
        }

        let szX = getCornerClearanceForWall(p.modules, sideWall, 2050, 2700, roomW).minStart;
        for (const m of sMezz) {
          m.x = szX;
          szX += buildModule(m).width;
        }

        const tallMin = getCornerClearanceForWall(p.modules, sideWall, 0, 2200, roomW).minStart;
        let stX = Math.max(tallMin, sbX, smX, szX);
        for (const m of sTall) {
          m.x = stX;
          stX += buildModule(m).width;
        }
      }
    });
  }
}
