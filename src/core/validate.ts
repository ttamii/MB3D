import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, DEFAULT_SETTINGS, KIND_LABEL, LIMITS, isCorner, isWall } from './defaults';
import type { DoorMode, HardwareItem, Kind, Material, MatKind, Module, Project, Section, Settings } from './types';
import { clamp, int, num, safeText, uid } from './util';
import { DEFAULT_ROOM, type DoorItem, type RoomConfig, type WindowItem } from './room';

const KINDS = Object.keys(KIND_LABEL) as Kind[];
const DOORS: DoorMode[] = ['none', 'hinged', 'sliding'];
const MAT_KINDS: MatKind[] = ['sheet', 'facade', 'back', 'top'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeSection(raw: unknown): Section {
  const r = isObj(raw) ? raw : {};
  const rods = int(r.rods ?? (r.rod ? 1 : 0), 0, ...LIMITS.rods);
  return {
    shelves: int(r.shelves, 0, ...LIMITS.shelves),
    drawers: int(r.drawers, 0, ...LIMITS.drawers),
    rod: rods > 0,
    rods,
    door: r.door !== false,
  };
}

/** Приводит любой объект к корректному модулю: ограничивает размеры, чинит ссылки на материалы. */
export function normalizeModule(raw: unknown, materials: Material[] = DEFAULT_MATERIALS): Module {
  const r = isObj(raw) ? raw : {};
  const kind: Kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'base';
  const corner = isCorner(kind);
  const wall = isWall(kind);

  const matId = (v: unknown, k: MatKind): string => {
    const list = materials.filter((x) => (k === 'facade' ? x.kind === 'facade' || x.kind === 'sheet' : x.kind === k));
    return list.find((x) => x.id === v)?.id ?? list[0]?.id ?? '';
  };

  const sectionsRaw = Array.isArray(r.sections) ? r.sections.slice(0, LIMITS.sections[1]) : [{}];
  let sections = (sectionsRaw.length ? sectionsRaw : [{}]).map(normalizeSection);
  if (corner) sections = [{ ...sections[0], drawers: 0, rod: false, rods: 0 }];

  const t = r.t === 18 ? 18 : 16;
  const d = int(r.d, 560, ...LIMITS.d);
  let w = int(r.w, 600, ...LIMITS.w);
  if (corner) w = Math.max(w, d + 200);
  const h = int(r.h, 720, ...LIMITS.h);
  const plinth = wall ? 0 : Math.min(int(r.plinth, 0, ...LIMITS.plinth), h - 200);

  // секции не должны быть уже 150 мм
  const maxSections = Math.max(1, Math.floor((w - 2 * t + t) / (150 + t)));
  if (!corner && sections.length > maxSections) sections = sections.slice(0, maxSections);

  const doorMode: DoorMode = DOORS.includes(r.doorMode as DoorMode) ? (r.doorMode as DoorMode) : 'hinged';
  const kindAllowsSliding = kind === 'wardrobe' || kind === 'tall';
  const milling = r.milling === 'frame' || r.milling === 'ribbed' || r.milling === 'modern' ? r.milling : undefined;
  const plinthColor = r.plinthColor === 'facade' || r.plinthColor === 'corpus' || r.plinthColor === 'black' ? r.plinthColor : undefined;
  const hinge = r.hinge === 'left' || r.hinge === 'right' ? r.hinge : undefined;

  return {
    id: typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : uid(),
    name: safeText(r.name, 60) || KIND_LABEL[kind],
    kind,
    x: clamp(num(r.x, 0), ...LIMITS.x),
    mirror: r.mirror === true,
    w,
    h,
    d,
    plinth,
    lift: wall ? int(r.lift, 1450, ...LIMITS.lift) : 0,
    t,
    sections,
    doorMode: doorMode === 'sliding' && !kindAllowsSliding ? 'hinged' : doorMode,
    slidingCount: int(r.slidingCount, 2, ...LIMITS.sliding),
    drawerH: int(r.drawerH, 200, ...LIMITS.drawerH),
    handles: r.handles !== false,
    countertop: r.countertop === true && (kind === 'base' || kind === 'corner'),
    matCorpus: matId(r.matCorpus, 'sheet'),
    matFacade: matId(r.matFacade, 'facade'),
    matBack: matId(r.matBack, 'back'),
    matTop: matId(r.matTop, 'top'),
    ...(milling ? { milling } : {}),
    ...(plinthColor && !wall ? { plinthColor } : {}),
    ...(hinge ? { hinge } : {}),
  };
}

/** Проверка и ограничение параметров помещения (стены, окна, двери). */
export function normalizeRoom(raw: unknown): RoomConfig | undefined {
  if (!isObj(raw)) return undefined;
  const w = int(raw.w, DEFAULT_ROOM.w, 1500, 12000);
  const d = int(raw.d, DEFAULT_ROOM.d, 1500, 12000);
  const h = int(raw.h, DEFAULT_ROOM.h, 2000, 4000);
  const WALLS = ['back', 'left', 'right'];
  const wallOf = (v: unknown): 'back' | 'left' | 'right' => (WALLS.includes(v as string) ? (v as 'back' | 'left' | 'right') : 'back');
  const idOf = (v: unknown, prefix: string, i: number): string =>
    typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : `${prefix}${i + 1}-${uid()}`;

  const windows: WindowItem[] = (Array.isArray(raw.windows) ? raw.windows : []).slice(0, 8).filter(isObj).map((o, i) => {
    const wall = wallOf(o.wall);
    const ow = int(o.w, 1200, 400, 3000);
    return {
      id: idOf(o.id, 'w', i), wall, w: ow,
      x: int(o.x, 50, 0, Math.max(0, (wall === 'back' ? w : d) - ow)),
      h: int(o.h, 1400, 400, 2500),
      lift: int(o.lift, 900, 0, 1500),
    };
  });
  const doors: DoorItem[] = (Array.isArray(raw.doors) ? raw.doors : []).slice(0, 8).filter(isObj).map((o, i) => {
    const wall = wallOf(o.wall);
    const ow = int(o.w, 800, 500, 1500);
    return {
      id: idOf(o.id, 'd', i), wall, w: ow,
      x: int(o.x, 50, 0, Math.max(0, (wall === 'back' ? w : d) - ow)),
      h: int(o.h, 2100, 1800, 2500),
      swing: o.swing === 'out' ? 'out' : 'in',
    };
  });
  return { w, d, h, wallThickness: int(raw.wallThickness, DEFAULT_ROOM.wallThickness, 80, 500), windows, doors };
}

export function normalizeProject(raw: unknown, materials: Material[] = DEFAULT_MATERIALS): Project | null {
  if (!isObj(raw) || !Array.isArray(raw.modules)) return null;
  const modules = raw.modules.slice(0, 60).map((m) => normalizeModule(m, materials));
  const seen = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.id)) m.id = uid();
    seen.add(m.id);
  }
  const room = normalizeRoom(raw.room);
  return {
    v: 1,
    id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : uid(),
    name: safeText(raw.name, 80) || 'Проект',
    updatedAt: num(raw.updatedAt, Date.now()),
    modules,
    ...(room ? { room } : {}),
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return structuredClone(d);

  const matsRaw = Array.isArray(raw.materials) ? raw.materials : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const m of matsRaw) if (isObj(m) && typeof m.id === 'string') byId.set(m.id, m);

  // материалы: берём каталог по умолчанию + пользовательские цены/названия
  const materials: Material[] = DEFAULT_MATERIALS.map((def) => {
    const o = byId.get(def.id);
    return o
      ? { ...def, name: safeText(o.name, 60) || def.name, price: clamp(num(o.price, def.price), 0, 10_000_000) }
      : { ...def };
  });
  // пользовательские материалы
  for (const [id, o] of byId) {
    if (materials.some((m) => m.id === id)) continue;
    const kind = MAT_KINDS.includes(o.kind as MatKind) ? (o.kind as MatKind) : 'sheet';
    const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#cccccc';
    if (/^[\w-]{1,40}$/.test(id) && materials.length < 250) {
      materials.push({ id, name: safeText(o.name, 60) || id, kind, color, price: clamp(num(o.price, 0), 0, 10_000_000), grain: o.grain === true });
    }
  }

  const hwRaw = isObj(raw.hardware) ? raw.hardware : {};
  const hardware: Record<string, HardwareItem> = {};
  for (const [k, def] of Object.entries(DEFAULT_HARDWARE)) {
    const o = isObj(hwRaw[k]) ? (hwRaw[k] as Record<string, unknown>) : {};
    hardware[k] = { ...def, price: clamp(num(o.price, def.price), 0, 10_000_000) };
  }

  const c = isObj(raw.company) ? raw.company : {};
  const l = isObj(raw.labor) ? raw.labor : {};
  return {
    v: 1,
    company: {
      name: safeText(c.name, 60) || d.company.name,
      phone: safeText(c.phone, 30),
      note: safeText(c.note, 240) || d.company.note,
      validDays: int(c.validDays, d.company.validDays, 1, 365),
    },
    waste: clamp(num(raw.waste, d.waste), 0, 60),
    edgePrice: clamp(num(raw.edgePrice, d.edgePrice), 0, 100000),
    materials,
    hardware,
    labor: {
      shop: clamp(num(l.shop, d.labor.shop), 0, 300),
      assembly: clamp(num(l.assembly, d.labor.assembly), 0, 300),
      tech: clamp(num(l.tech, d.labor.tech), 0, 300),
      logistics: clamp(num(l.logistics, d.labor.logistics), 0, 300),
      markup: clamp(num(l.markup, d.labor.markup), 0, 500),
    },
  };
}
