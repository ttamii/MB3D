import { isWall } from '../core/defaults';
import { getTallOvenZones, isDoubleDoorSection } from '../core/geometry';
import type { Kind, Module, Section } from '../core/types';
import { uid } from '../core/util';
import type { Store } from '../app/store';
import type { Viewer } from '../three/viewer';
import { clear, h, icon } from './dom';
import { toast } from './dialogs';

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return { shelves: 0, drawers: 0, rod: rods > 0, rods, door: true, ...p };
};

interface SketchPreset {
  id: string;
  label: string;
  group: string;
  tab: 'kitchen' | 'wardrobe';
  svgThumb: string;
  make: (wall: 'back' | 'left' | 'right', corpus: string, facade: string, top: string, defDepth: number) => Module;
}

const thumbSvg = (body: string) =>
  `<svg viewBox="0 0 64 56" width="56" height="48" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const SKETCH_PRESETS: SketchPreset[] = [
  // ——— КУХНЯ: НАПОЛЬНЫЕ ———
  {
    id: 'sk-base-450', label: 'Тумба, 450', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="14" y="8" width="36" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="14" y1="45" x2="50" y2="45" stroke="#60a5fa"/><line x1="45" y1="14" x2="45" y2="24" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Нижний модуль 450', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 450, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 1 })],
    }),
  },
  {
    id: 'sk-base-600', label: 'Тумба, 600', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="10" y="8" width="44" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="10" y1="45" x2="54" y2="45" stroke="#60a5fa"/><line x1="48" y1="14" x2="48" y2="24" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Нижний модуль 600', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 1 })],
    }),
  },
  {
    id: 'sk-base-800', label: 'Тумба 800, 2 двери', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="8" y="8" width="48" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="32" y1="8" x2="32" y2="45" stroke="#60a5fa" stroke-width="1.2"/><line x1="8" y1="45" x2="56" y2="45" stroke="#60a5fa"/><line x1="27" y1="14" x2="27" y2="23" stroke="#e2e8f0" stroke-width="1.6"/><line x1="37" y1="14" x2="37" y2="23" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Нижний модуль 800', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 800, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', doorCount: 2, slidingCount: 2, drawerH: 200, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 1 })],
    }),
  },
  {
    id: 'sk-drw-3', label: 'Три ящика, 600', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="10" y="8" width="44" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="10" y1="20" x2="54" y2="20" stroke="#60a5fa"/><line x1="10" y1="32" x2="54" y2="32" stroke="#60a5fa"/><line x1="10" y1="45" x2="54" y2="45" stroke="#60a5fa"/><line x1="27" y1="14" x2="37" y2="14" stroke="#e2e8f0" stroke-width="1.6"/><line x1="27" y1="26" x2="37" y2="26" stroke="#e2e8f0" stroke-width="1.6"/><line x1="27" y1="38" x2="37" y2="38" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Модуль с 3 ящиками', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'none', slidingCount: 2, drawerH: 238, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ drawers: 3, door: false })],
    }),
  },
  {
    id: 'sk-drw-dryer', label: '2 ящика (сушка), 600', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="10" y="8" width="44" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="10" y1="26" x2="54" y2="26" stroke="#60a5fa"/><line x1="10" y1="45" x2="54" y2="45" stroke="#60a5fa"/><path d="M18 14h28M22 14v8M28 14v8M34 14v8M40 14v8" stroke="#93c5fd" stroke-width="1"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Модуль с 2 ящиками (сушка посуды)', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'none', slidingCount: 2, drawerH: 355, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ drawers: 2, door: false })],
    }),
  },
  {
    id: 'sk-sink-corner', label: 'Мойка угловая, 1250', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="6" y="8" width="52" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="22" y1="8" x2="22" y2="45" stroke="#f59e0b" stroke-width="1.4"/><path d="M6 8l16 37M22 8L6 45" stroke="#64748b" stroke-width="1"/><line x1="26" y1="15" x2="26" y2="24" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Модуль под мойку (угловой)', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 1250, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', doorCount: 1, hinge: 'right', slidingCount: 2, drawerH: 200, handles: true, countertop: true,
      blindSide: 'left', blindW: 550, blindFillerW: 50,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 0 })],
    }),
  },
  {
    id: 'sk-oven-base', label: 'Под духовку, 600', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="10" y="8" width="44" height="42" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><rect x="14" y="11" width="36" height="24" fill="#0f172a" stroke="#94a3b8"/><line x1="10" y1="37" x2="54" y2="37" stroke="#60a5fa"/><line x1="10" y1="45" x2="54" y2="45" stroke="#60a5fa"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Модуль под варочную поверхность / духовку', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'none', slidingCount: 2, drawerH: 160, handles: true, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ drawers: 1, shelves: 1, door: false })],
    }),
  },
  {
    id: 'sk-filler', label: 'Планка/добор, 50', group: 'Напольные', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="26" y="8" width="12" height="42" fill="#2c3a4b" stroke="#f59e0b" stroke-width="1.4"/><path d="M26 8l12 42M38 8L26 50" stroke="#f59e0b" stroke-width="1"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Фальшпланка к стене', kind: 'base', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 50, h: 820, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'none', slidingCount: 2, drawerH: 200, handles: false, countertop: true,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 0, door: false })],
    }),
  },
  // ——— КУХНЯ: НАВЕСНЫЕ И ПЕНАЛЫ ———
  {
    id: 'sk-wall-600', label: 'Навесной, 600', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="10" y="10" width="44" height="36" fill="#2c3a4b" stroke="#38bdf8" stroke-width="1.4"/><line x1="14" y1="22" x2="50" y2="22" stroke="#64748b" stroke-dasharray="2,2"/><line x1="14" y1="34" x2="50" y2="34" stroke="#64748b" stroke-dasharray="2,2"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Верхний шкаф (2 полки)', kind: 'wall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 800, d: 300, plinth: 0, lift: 1400, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: false, countertop: false,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 2 })],
    }),
  },
  {
    id: 'sk-wall-corner', label: 'Навесной угл., 1250', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="6" y="10" width="52" height="36" fill="#2c3a4b" stroke="#38bdf8" stroke-width="1.4"/><line x1="22" y1="10" x2="22" y2="46" stroke="#f59e0b" stroke-width="1.4"/><path d="M6 10l16 36M22 10L6 46" stroke="#64748b" stroke-width="1"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Верхний угловой шкаф (2 полки)', kind: 'wall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 1250, h: 800, d: 300, plinth: 0, lift: 1400, t: 16, mirror: false,
      doorMode: 'hinged', doorCount: 1, hinge: 'right', slidingCount: 2, drawerH: 200, handles: false, countertop: false,
      blindSide: 'left', blindW: 550, blindFillerW: 50,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 2 })],
    }),
  },
  {
    id: 'sk-mezz-600', label: 'Антресоль, 600', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="8" y="16" width="48" height="22" fill="#2c3a4b" stroke="#38bdf8" stroke-width="1.4"/><path d="M8 38L32 16L56 38" fill="none" stroke="#64748b" stroke-dasharray="2,2"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Антресоль', kind: 'wall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 400, d: 300, plinth: 0, lift: 2200, t: 16, mirror: false,
      doorMode: 'hinged', hinge: 'top', slidingCount: 2, drawerH: 200, handles: false, countertop: false, topTrim: 60,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 0 })],
    }),
  },
  {
    id: 'sk-tall-oven', label: 'Пенал духовка/СВЧ', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="16" y="4" width="32" height="48" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><rect x="19" y="22" width="26" height="8" fill="#0f172a" stroke="#94a3b8"/><rect x="19" y="31" width="26" height="11" fill="#0f172a" stroke="#94a3b8"/><line x1="16" y1="48" x2="48" y2="48" stroke="#60a5fa"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Пенал с нишей под духовку/СВЧ', kind: 'tall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 2600, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 360, ovenH: 600, mwH: 380, handles: true, countertop: false, topTrim: 60,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ drawers: 1, shelves: 2 })],
    }),
  },
  {
    id: 'sk-tall-shelves', label: 'Пенал полки, 500', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="18" y="4" width="28" height="48" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><path d="M20 12h24M20 20h24M20 28h24M20 36h24" stroke="#64748b" stroke-dasharray="2,2"/>`),
    make: (wall, mc, mf, mt, d) => ({
      id: uid(), name: 'Пенал 500 (полки)', kind: 'tall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 500, h: 2600, d: Math.max(300, d || 500), plinth: 100, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: false, topTrim: 60,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 6 })],
    }),
  },
  {
    id: 'sk-fridge', label: 'Холодильник, 600', group: 'Навесные и Пеналы', tab: 'kitchen',
    svgThumb: thumbSvg(`<rect x="14" y="6" width="36" height="44" fill="#334155" stroke="#94a3b8" stroke-width="1.4"/><line x1="14" y1="34" x2="50" y2="34" stroke="#94a3b8"/><line x1="18" y1="18" x2="18" y2="30" stroke="#e2e8f0" stroke-width="1.6"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Холодильник (невстроенный)', kind: 'tall', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 2050, d: 600, plinth: 0, lift: 0, t: 16, mirror: false,
      doorMode: 'none', slidingCount: 2, drawerH: 200, handles: true, countertop: false,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 0, door: false })],
    }),
  },
  // ——— ГАРДЕРОБ ———
  {
    id: 'sk-w-rod', label: 'Штанга и полка, 800', group: 'Секции гардероба', tab: 'wardrobe',
    svgThumb: thumbSvg(`<rect x="14" y="4" width="36" height="48" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="16" y1="14" x2="48" y2="14" stroke="#cbd5e1"/><line x1="18" y1="18" x2="46" y2="18" stroke="#e2e8f0" stroke-width="2"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Шкаф со штангой', kind: 'wardrobe', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 800, h: 2200, d: 560, plinth: 80, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: false,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ rod: true, rods: 1, shelves: 1 })],
    }),
  },
  {
    id: 'sk-w-2rod', label: 'Две штанги, 1000', group: 'Секции гардероба', tab: 'wardrobe',
    svgThumb: thumbSvg(`<rect x="12" y="4" width="40" height="48" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><line x1="14" y1="26" x2="50" y2="26" stroke="#cbd5e1"/><line x1="16" y1="10" x2="48" y2="10" stroke="#e2e8f0" stroke-width="2"/><line x1="16" y1="30" x2="48" y2="30" stroke="#e2e8f0" stroke-width="2"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Шкаф 2 штанги', kind: 'wardrobe', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 1000, h: 2200, d: 560, plinth: 80, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: false,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ rod: true, rods: 2, shelves: 1 })],
    }),
  },
  {
    id: 'sk-w-shelves', label: 'Полки, 600', group: 'Секции гардероба', tab: 'wardrobe',
    svgThumb: thumbSvg(`<rect x="16" y="4" width="32" height="48" fill="#2c3a4b" stroke="#60a5fa" stroke-width="1.4"/><path d="M18 12h28M18 20h28M18 28h28M18 36h28M18 44h28" stroke="#cbd5e1"/>`),
    make: (wall, mc, mf, mt) => ({
      id: uid(), name: 'Шкаф с полками', kind: 'wardrobe', wall: wall === 'back' ? undefined : wall,
      x: 0, w: 600, h: 2200, d: 560, plinth: 80, lift: 0, t: 16, mirror: false,
      doorMode: 'hinged', slidingCount: 2, drawerH: 200, handles: true, countertop: false,
      matCorpus: mc, matFacade: mf, matBack: 'b-white', matTop: mt, sections: [sec({ shelves: 5 })],
    }),
  },
];

export function openSketchEditor(store: Store, viewer: Viewer): void {
  let draftMods: Module[] = JSON.parse(JSON.stringify(store.project.modules));
  const room = store.project.room ?? { w: 4500, d: 3000, h: 2700 };
  let activeWall: 'back' | 'left' | 'right' = 'back';
  let activeTool: 'select' | 'draw' = 'draw';
  let activeTab: 'kitchen' | 'wardrobe' | 'fill' = 'kitchen';
  let selectedId: string | null = draftMods.find((m) => (m.wall ?? 'back') === activeWall)?.id ?? null;
  let defaultDepth = 500;
  let defCorpus = draftMods[0]?.matCorpus ?? store.settings.materials.find((m) => m.kind === 'sheet')?.id ?? 'eg-w1000';
  let defFacade = draftMods[0]?.matFacade ?? store.settings.materials.find((m) => m.kind === 'facade')?.id ?? 'pm-u702';
  const defTop = draftMods[0]?.matTop ?? store.settings.materials.find((m) => m.kind === 'top')?.id ?? 'top-f812';

  const undoStack: string[] = [];
  const redoStack: string[] = [];
  const snapshotUndo = () => {
    undoStack.push(JSON.stringify(draftMods));
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
  };

  // Вид/зум холста (в координатах: мм -> пиксели)
  let scale = 0.24;
  let panX = 120;
  let panY = 760; // базовая линия пола в SVG px

  const overlay = h('div', { class: 'sketch-overlay' });
  document.body.append(overlay);

  const closeOverlay = () => {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  };

  const wallLen = () => (activeWall === 'back' ? room.w : room.d);
  const wallMods = () => draftMods.filter((m) => (m.wall ?? 'back') === activeWall);
  const selectedMod = () => draftMods.find((m) => m.id === selectedId) ?? null;

  const findNextFreeX = (w: number, lift: number, hVal: number): number => {
    const sameTier = wallMods().filter((m) => Math.min(m.lift + m.h, lift + hVal) - Math.max(m.lift, lift) > 20);
    const minStart = (activeWall === 'left' || activeWall === 'right')
      ? (isWall(hVal <= 850 && lift >= 1000 ? 'wall' : 'base') ? 350 : 550)
      : 0;
    const sorted = [...sameTier].sort((a, b) => a.x - b.x);
    let cursor = sorted.length === 0 ? minStart : 0;
    for (const m of sorted) {
      if (m.x - cursor >= w) return cursor;
      cursor = Math.max(cursor, m.x + m.w);
    }
    return cursor;
  };

  // Элементы интерфейса
  const topBar = h('div', { class: 'sk-top' });
  const bodyWrap = h('div', { class: 'sk-body' });
  const leftPanel = h('aside', { class: 'sk-left' });
  const canvasWrap = h('div', { class: 'sk-canvas-wrap' });
  const rightInspector = h('aside', { class: 'sk-right' });
  const bottomBar = h('div', { class: 'sk-bottom' });
  const ctxPopup = h('div', { class: 'sk-ctx-popup', style: 'display:none;' });
  canvasWrap.append(ctxPopup);

  overlay.append(topBar, bodyWrap, bottomBar);
  bodyWrap.append(leftPanel, canvasWrap, rightInspector);

  const svgHost = h('div', { class: 'sk-svg-host' });
  canvasWrap.append(svgHost);

  const toMm = (px: number, py: number) => ({
    x: Math.round(((px - panX) / scale) / 10) * 10,
    y: Math.round(((panY - py) / scale) / 10) * 10,
  });

  const snapX = (val: number, ignoreId: string, w: number, lift: number, hVal: number): number => {
    const cands = [0, wallLen() - w, 350, 500, 550];
    wallMods().forEach((o) => {
      if (o.id === ignoreId) return;
      if (Math.min(o.lift + o.h, lift + hVal) - Math.max(o.lift, lift) > 15) {
        cands.push(o.x + o.w, o.x - w);
      }
    });
    let best = val;
    let bestD = 35;
    for (const c of cands) {
      if (Math.abs(val - c) < bestD) { bestD = Math.abs(val - c); best = c; }
    }
    return Math.max(0, Math.min(wallLen(), best));
  };

  const snapY = (val: number, ignoreId: string, hVal: number): number => {
    const cands = [0, 820, 1400, 1450, 2200, room.h - hVal];
    wallMods().forEach((o) => {
      if (o.id === ignoreId) return;
      cands.push(o.lift, o.lift + o.h, o.lift - hVal);
    });
    let best = val;
    let bestD = 35;
    for (const c of cands) {
      if (Math.abs(val - c) < bestD) { bestD = Math.abs(val - c); best = c; }
    }
    return Math.max(0, Math.min(room.h - hVal, best));
  };

  let drawState: {
    mode: 'new' | 'pan' | 'move' | 'resize-r' | 'resize-t';
    startPx: number;
    startPy: number;
    curPx: number;
    curPy: number;
    modId?: string;
    origX?: number;
    origY?: number;
    origW?: number;
    origH?: number;
    origPanX?: number;
    origPanY?: number;
  } | null = null;

  const openQuickDiagPopup = (mod: Module, clientX: number, clientY: number) => {
    clear(ctxPopup);
    const rect = canvasWrap.getBoundingClientRect();
    const apply = (fn: (m: Module) => void) => {
      snapshotUndo();
      fn(mod);
      ctxPopup.style.display = 'none';
      renderAll();
    };
    const qBtn = (txt: string, fn: () => void, active = false) =>
      h('button', { type: 'button', class: `sk-qbtn ${active ? 'on' : ''}`, onClick: fn }, txt);

    ctxPopup.append(
      h('div', { class: 'sk-qsec' },
        h('span', { class: 'sk-qlabel' }, 'Дверь'),
        h('div', { class: 'sk-qrow' },
          qBtn('Слева', () => apply((m) => { m.doorMode = 'hinged'; m.hinge = 'left'; m.doorCount = 1; m.sections[0].door = true; }), mod.doorMode === 'hinged' && mod.hinge === 'left'),
          qBtn('Справа', () => apply((m) => { m.doorMode = 'hinged'; m.hinge = 'right'; m.doorCount = 1; m.sections[0].door = true; }), mod.doorMode === 'hinged' && mod.hinge === 'right'),
          qBtn('2 двери', () => apply((m) => { m.doorMode = 'hinged'; m.doorCount = 2; m.hinge = undefined; m.sections[0].door = true; }), mod.doorMode === 'hinged' && mod.doorCount === 2),
          qBtn('Откидная', () => apply((m) => { m.doorMode = 'hinged'; m.hinge = 'top'; m.doorCount = 1; m.sections[0].door = true; }), mod.hinge === 'top'),
          qBtn('Открытый', () => apply((m) => { m.doorMode = 'none'; }), mod.doorMode === 'none'),
        ),
      ),
      h('div', { class: 'sk-qsec' },
        h('span', { class: 'sk-qlabel' }, 'Ящики'),
        h('div', { class: 'sk-qrow' },
          ...[0, 1, 2, 3, 4].map((n) =>
            qBtn(n === 0 ? 'Без' : String(n), () => apply((m) => {
              m.sections[0].drawers = n;
              if (n > 0) {
                m.doorMode = 'none';
                m.drawerH = Math.round((m.h - m.plinth) / n);
              }
            }), mod.sections[0]?.drawers === n),
          ),
        ),
      ),
      h('div', { class: 'sk-qsec' },
        h('span', { class: 'sk-qlabel' }, 'Угол и опции'),
        h('div', { class: 'sk-qrow' },
          qBtn('Угловая зона Л', () => apply((m) => { m.blindSide = 'left'; m.blindW = isWall(m.kind) ? 350 : 550; m.blindFillerW = 50; }), mod.blindSide === 'left'),
          qBtn('Угловая зона П', () => apply((m) => { m.blindSide = 'right'; m.blindW = isWall(m.kind) ? 350 : 550; m.blindFillerW = 50; }), mod.blindSide === 'right'),
          qBtn('Без ручек', () => apply((m) => { m.handles = !m.handles; }), !mod.handles),
          qBtn('Столешница', () => apply((m) => { m.countertop = !m.countertop; }), mod.countertop),
        ),
      ),
      h('button', { type: 'button', class: 'sk-qclose', onClick: () => { ctxPopup.style.display = 'none'; } }, 'Закрыть'),
    );

    const leftPos = Math.min(rect.width - 280, Math.max(12, clientX - rect.left + 12));
    const topPos = Math.min(rect.height - 230, Math.max(12, clientY - rect.top + 12));
    ctxPopup.style.left = `${leftPos}px`;
    ctxPopup.style.top = `${topPos}px`;
    ctxPopup.style.display = 'flex';
  };

  const renderCanvas = () => {
    const rect = canvasWrap.getBoundingClientRect();
    const W = Math.max(400, Math.round(rect.width || 900));
    const H = Math.max(300, Math.round(rect.height || 620));
    const wLen = wallLen();
    const mods = wallMods();

    // Сетка 100 мм
    const gx = (mm: number) => panX + mm * scale;
    const gy = (mm: number) => panY - mm * scale;

    const wallX0 = gx(0);
    const wallX1 = gx(wLen);
    const floorY = gy(0);
    const ceilY = gy(room.h);

    const gridLines: string[] = [];
    const stepMm = scale < 0.16 ? 200 : 100;
    for (let x = 0; x <= wLen; x += stepMm) {
      const px = gx(x);
      gridLines.push(`<line x1="${px.toFixed(1)}" y1="${ceilY.toFixed(1)}" x2="${px.toFixed(1)}" y2="${floorY.toFixed(1)}" stroke="${x % 500 === 0 ? '#334155' : '#262d38'}" stroke-width="${x % 500 === 0 ? 1 : 0.7}" />`);
    }
    for (let y = 0; y <= room.h; y += stepMm) {
      const py = gy(y);
      gridLines.push(`<line x1="${wallX0.toFixed(1)}" y1="${py.toFixed(1)}" x2="${wallX1.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${y % 500 === 0 ? '#334155' : '#262d38'}" stroke-width="${y % 500 === 0 ? 1 : 0.7}" />`);
    }

    // Если боковая стена — подсвечиваем слева зону глубины заднего ряда (500 мм / 300 мм)
    let cornerHintSvg = '';
    if (activeWall === 'left' || activeWall === 'right') {
      const x500 = gx(500);
      const x300 = gx(300);
      cornerHintSvg = `
        <rect x="${wallX0.toFixed(1)}" y="${gy(858).toFixed(1)}" width="${(x500 - wallX0).toFixed(1)}" height="${(858 * scale).toFixed(1)}" fill="rgba(245,158,11,0.08)" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,3" />
        <text x="${((wallX0 + x500) / 2).toFixed(1)}" y="${gy(420).toFixed(1)}" font-size="10" fill="#f59e0b" text-anchor="middle" font-weight="600">Угол 500</text>
        <rect x="${wallX0.toFixed(1)}" y="${gy(2600).toFixed(1)}" width="${(x300 - wallX0).toFixed(1)}" height="${(1200 * scale).toFixed(1)}" fill="rgba(56,189,248,0.07)" stroke="#38bdf8" stroke-width="1" stroke-dasharray="4,3" />
      `;
    }

    // Отрисовка всех модулей выбранной стены
    const modSvgs: string[] = [];
    for (const m of mods) {
      const mx = gx(m.x);
      const my = gy(m.lift + m.h);
      const mw = m.w * scale;
      const mh = m.h * scale;
      const isSel = m.id === selectedId;
      const isFridge = m.kind === 'tall' && /холодильник/i.test(m.name) && (!/встроен/i.test(m.name) || /невстроен/i.test(m.name));
      const facColor = isFridge ? '#374151' : '#334155';
      const strokeC = isSel ? '#38bdf8' : '#94a3b8';

      const details: string[] = [];
      // Столешница
      if (m.countertop && m.kind === 'base') {
        const ctH = Math.max(4, 38 * scale);
        details.push(`<rect x="${mx.toFixed(1)}" y="${(my - ctH).toFixed(1)}" width="${mw.toFixed(1)}" height="${ctH.toFixed(1)}" fill="#e2e8f0" stroke="#64748b" stroke-width="0.9" />`);
      }
      // Цоколь
      if (m.plinth > 0) {
        const plH = m.plinth * scale;
        details.push(`<rect x="${mx.toFixed(1)}" y="${(my + mh - plH).toFixed(1)}" width="${mw.toFixed(1)}" height="${plH.toFixed(1)}" fill="#1e293b" stroke="#64748b" stroke-width="0.9" />`);
      }
      // Глухая угловая зона + L-планка
      let openStartMm = 0;
      let openEndMm = m.w;
      if (m.blindSide && (m.blindW ?? 0) > 0) {
        const bw = Math.min(m.w - 100, m.blindW ?? 350);
        const fw = Math.min(bw, m.blindFillerW ?? 50);
        const bx = m.blindSide === 'left' ? gx(m.x) : gx(m.x + m.w - bw);
        const bPx = bw * scale;
        const fPx = fw * scale;
        const fx = m.blindSide === 'left' ? bx + bPx - fPx : bx;
        details.push(`
          <rect x="${bx.toFixed(1)}" y="${my.toFixed(1)}" width="${bPx.toFixed(1)}" height="${mh.toFixed(1)}" fill="#1e2430" stroke="#f59e0b" stroke-width="1" />
          <line x1="${bx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${(bx + bPx).toFixed(1)}" y2="${(my + mh).toFixed(1)}" stroke="#475569" stroke-width="0.9" />
          <line x1="${(bx + bPx).toFixed(1)}" y1="${my.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${(my + mh).toFixed(1)}" stroke="#475569" stroke-width="0.9" />
          <rect x="${fx.toFixed(1)}" y="${my.toFixed(1)}" width="${fPx.toFixed(1)}" height="${mh.toFixed(1)}" fill="#475569" stroke="#f59e0b" stroke-width="1.2" />
        `);
        if (m.blindSide === 'left') openStartMm = bw;
        else openEndMm = m.w - bw;
      }

      // Внутренние секции, двери, ящики, духовка/СВЧ
      const zones = getTallOvenZones(m);
      if (zones.isTallOven && zones.hasOven) {
        const yB = gy(m.lift + zones.yHor1);
        const yO0 = gy(m.lift + zones.yOv0);
        const yO1 = gy(m.lift + zones.yOv1);
        details.push(`<rect x="${(mx + 3).toFixed(1)}" y="${yO1.toFixed(1)}" width="${Math.max(4, mw - 6).toFixed(1)}" height="${Math.max(4, yO0 - yO1).toFixed(1)}" fill="#0f172a" stroke="#94a3b8" stroke-width="1" />`);
        details.push(`<text x="${(mx + mw / 2).toFixed(1)}" y="${((yO0 + yO1) / 2 + 3).toFixed(1)}" font-size="9" fill="#94a3b8" text-anchor="middle">Духовка ${zones.ovenH}</text>`);
        if (zones.hasMw) {
          const yM0 = gy(m.lift + zones.yMw0);
          const yM1 = gy(m.lift + zones.yMw1);
          details.push(`<rect x="${(mx + 3).toFixed(1)}" y="${yM1.toFixed(1)}" width="${Math.max(4, mw - 6).toFixed(1)}" height="${Math.max(4, yM0 - yM1).toFixed(1)}" fill="#0f172a" stroke="#94a3b8" stroke-width="1" />`);
          details.push(`<text x="${(mx + mw / 2).toFixed(1)}" y="${((yM0 + yM1) / 2 + 3).toFixed(1)}" font-size="8.5" fill="#94a3b8" text-anchor="middle">СВЧ ${zones.mwH}</text>`);
        }
        details.push(`<line x1="${mx.toFixed(1)}" y1="${yB.toFixed(1)}" x2="${(mx + mw).toFixed(1)}" y2="${yB.toFixed(1)}" stroke="#60a5fa" stroke-width="1" />`);
      } else {
        const openPxX0 = gx(m.x + openStartMm);
        const openPxW = (openEndMm - openStartMm) * scale;
        const secN = Math.max(1, m.sections.length);
        const secPxW = openPxW / secN;
        const bodyTopY = my;
        const bodyBotY = gy(m.lift + m.plinth);
        const bodyPxH = Math.max(4, bodyBotY - bodyTopY);

        m.sections.forEach((s, idx) => {
          const sx0 = openPxX0 + idx * secPxW;
          if (idx > 0) {
            details.push(`<line x1="${sx0.toFixed(1)}" y1="${bodyTopY.toFixed(1)}" x2="${sx0.toFixed(1)}" y2="${bodyBotY.toFixed(1)}" stroke="#94a3b8" stroke-width="1.2" />`);
          }
          // Ящики
          if (s.drawers > 0) {
            const dh = Math.min(bodyPxH / s.drawers, (m.drawerH * scale) || (bodyPxH / s.drawers));
            for (let k = 0; k < s.drawers; k++) {
              const yLine = bodyBotY - (k + 1) * dh;
              details.push(`<line x1="${sx0.toFixed(1)}" y1="${yLine.toFixed(1)}" x2="${(sx0 + secPxW).toFixed(1)}" y2="${yLine.toFixed(1)}" stroke="#60a5fa" stroke-width="1" />`);
              if (m.handles) {
                const hy = yLine + 5;
                details.push(`<line x1="${(sx0 + secPxW * 0.35).toFixed(1)}" y1="${hy.toFixed(1)}" x2="${(sx0 + secPxW * 0.65).toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#e2e8f0" stroke-width="2" />`);
              }
            }
          } else if (m.doorMode === 'hinged' && s.door) {
            const openW = openEndMm - openStartMm;
            const nD = isDoubleDoorSection(m, openW / secN) ? 2 : 1;
            const dPxW = secPxW / nD;
            for (let dk = 0; dk < nD; dk++) {
              const dx0 = sx0 + dk * dPxW;
              if (dk > 0) {
                details.push(`<line x1="${dx0.toFixed(1)}" y1="${bodyTopY.toFixed(1)}" x2="${dx0.toFixed(1)}" y2="${bodyBotY.toFixed(1)}" stroke="#60a5fa" stroke-width="1" />`);
              }
              const hSide = nD === 2 ? (dk === 0 ? 'left' : 'right') : (m.hinge ?? 'left');
              if (hSide === 'top') {
                details.push(`<path d="M${dx0.toFixed(1)},${bodyBotY.toFixed(1)} L${(dx0 + dPxW / 2).toFixed(1)},${bodyTopY.toFixed(1)} L${(dx0 + dPxW).toFixed(1)},${bodyBotY.toFixed(1)}" fill="none" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3,2" />`);
              } else {
                const pxSide = hSide === 'left' ? dx0 : dx0 + dPxW;
                const pxOp = hSide === 'left' ? dx0 + dPxW : dx0;
                details.push(`<path d="M${pxSide.toFixed(1)},${bodyTopY.toFixed(1)} L${pxOp.toFixed(1)},${(bodyTopY + bodyPxH / 2).toFixed(1)} L${pxSide.toFixed(1)},${bodyBotY.toFixed(1)}" fill="none" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3,2" />`);
                if (m.handles) {
                  const hx = hSide === 'left' ? dx0 + dPxW - 5 : dx0 + 5;
                  details.push(`<line x1="${hx.toFixed(1)}" y1="${(bodyTopY + 8).toFixed(1)}" x2="${hx.toFixed(1)}" y2="${Math.min(bodyBotY - 8, bodyTopY + 26).toFixed(1)}" stroke="#e2e8f0" stroke-width="2" />`);
                }
              }
            }
          }
          // Полки (пунктир)
          for (let sk = 1; sk <= s.shelves; sk++) {
            const sy = bodyTopY + (sk * bodyPxH) / (s.shelves + 1);
            details.push(`<line x1="${(sx0 + 2).toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(sx0 + secPxW - 2).toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2,2" />`);
          }
        });
      }

      // Маркеры растяжения (если выделен)
      const handlesSvg = isSel ? `
        <rect class="sk-h-r" data-id="${m.id}" x="${(mx + mw - 5).toFixed(1)}" y="${(my + mh / 2 - 10).toFixed(1)}" width="10" height="20" rx="2" fill="#38bdf8" stroke="#0f172a" stroke-width="1" style="cursor:ew-resize;" />
        <rect class="sk-h-t" data-id="${m.id}" x="${(mx + mw / 2 - 10).toFixed(1)}" y="${(my - 5).toFixed(1)}" width="20" height="10" rx="2" fill="#38bdf8" stroke="#0f172a" stroke-width="1" style="cursor:ns-resize;" />
      ` : '';

      modSvgs.push(`
        <g class="sk-mod" data-id="${m.id}" style="cursor:${activeTool === 'select' ? 'move' : 'crosshair'};">
          <rect x="${mx.toFixed(1)}" y="${my.toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" fill="${facColor}" fill-opacity="0.85" stroke="${strokeC}" stroke-width="${isSel ? 2.2 : 1.2}" />
          ${details.join('')}
          ${mw > 34 ? `<text x="${(mx + mw / 2).toFixed(1)}" y="${(my + mh / 2 - 4).toFixed(1)}" font-size="10" font-weight="700" fill="#f1f5f9" text-anchor="middle">${m.w}</text>` : ''}
          ${handlesSvg}
        </g>
      `);
    }

    // Размерная цепочка ширин снизу (нижний/основной ряд)
    const lowerMods = [...mods]
      .filter((m) => m.lift < 1000)
      .sort((a, b) => a.x - b.x);
    const dimChainSvg: string[] = [];
    const dy1 = floorY + 24;
    for (const lm of lowerMods) {
      const lx0 = gx(lm.x);
      const lx1 = gx(lm.x + lm.w);
      dimChainSvg.push(`
        <line x1="${lx0.toFixed(1)}" y1="${(dy1 - 4).toFixed(1)}" x2="${lx0.toFixed(1)}" y2="${(dy1 + 4).toFixed(1)}" stroke="#94a3b8" stroke-width="1" />
        <line x1="${lx1.toFixed(1)}" y1="${(dy1 - 4).toFixed(1)}" x2="${lx1.toFixed(1)}" y2="${(dy1 + 4).toFixed(1)}" stroke="#94a3b8" stroke-width="1" />
        <line x1="${lx0.toFixed(1)}" y1="${dy1.toFixed(1)}" x2="${lx1.toFixed(1)}" y2="${dy1.toFixed(1)}" stroke="#64748b" stroke-width="1" />
        <text x="${((lx0 + lx1) / 2).toFixed(1)}" y="${(dy1 + 13).toFixed(1)}" font-size="10" font-weight="600" fill="#cbd5e1" text-anchor="middle">${lm.w}</text>
      `);
    }
    const dy2 = floorY + 48;
    dimChainSvg.push(`
      <line x1="${wallX0.toFixed(1)}" y1="${dy2.toFixed(1)}" x2="${wallX1.toFixed(1)}" y2="${dy2.toFixed(1)}" stroke="#38bdf8" stroke-width="1.2" />
      <line x1="${wallX0.toFixed(1)}" y1="${(dy2 - 5).toFixed(1)}" x2="${wallX0.toFixed(1)}" y2="${(dy2 + 5).toFixed(1)}" stroke="#38bdf8" stroke-width="1.2" />
      <line x1="${wallX1.toFixed(1)}" y1="${(dy2 - 5).toFixed(1)}" x2="${wallX1.toFixed(1)}" y2="${(dy2 + 5).toFixed(1)}" stroke="#38bdf8" stroke-width="1.2" />
      <text x="${((wallX0 + wallX1) / 2).toFixed(1)}" y="${(dy2 + 13).toFixed(1)}" font-size="11" font-weight="700" fill="#38bdf8" text-anchor="middle">Длина стены: ${wLen} мм · Потолок: ${room.h} мм</text>
    `);

    // Активная линия/прямоугольник при рисовании карандашом
    let ghostDrawSvg = '';
    if (drawState && drawState.mode === 'new') {
      const xA = Math.min(drawState.startPx, drawState.curPx);
      const yA = Math.min(drawState.startPy, drawState.curPy);
      const gW = Math.abs(drawState.curPx - drawState.startPx);
      const gH = Math.abs(drawState.curPy - drawState.startPy);
      const mmW = Math.round(gW / scale / 10) * 10;
      const mmH = Math.round(gH / scale / 10) * 10;
      ghostDrawSvg = `
        <rect x="${xA.toFixed(1)}" y="${yA.toFixed(1)}" width="${gW.toFixed(1)}" height="${gH.toFixed(1)}" fill="rgba(56,189,248,0.16)" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="5,3" />
        <line x1="${drawState.startPx.toFixed(1)}" y1="${drawState.startPy.toFixed(1)}" x2="${drawState.curPx.toFixed(1)}" y2="${drawState.curPy.toFixed(1)}" stroke="#f8fafc" stroke-width="2" />
        <text x="${(xA + gW / 2).toFixed(1)}" y="${(yA - 6).toFixed(1)}" font-size="11" font-weight="700" fill="#38bdf8" text-anchor="middle">${mmW} × ${mmH} мм</text>
      `;
    }

    svgHost.innerHTML = `
      <svg id="sk-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block; background:#1b1f27; user-select:none;">
        ${gridLines.join('')}
        <!-- Граница стены (пол и потолок) -->
        <rect x="${wallX0.toFixed(1)}" y="${ceilY.toFixed(1)}" width="${(wallX1 - wallX0).toFixed(1)}" height="${(floorY - ceilY).toFixed(1)}" fill="none" stroke="#475569" stroke-width="1.4" stroke-dasharray="6,4" />
        <line x1="0" y1="${floorY.toFixed(1)}" x2="${W}" y2="${floorY.toFixed(1)}" stroke="#64748b" stroke-width="1.5" />
        ${cornerHintSvg}
        ${modSvgs.join('')}
        ${dimChainSvg.join('')}
        ${ghostDrawSvg}
      </svg>
    `;
  };

  const renderTopBar = () => {
    clear(topBar);
    const sheetMats = store.settings.materials.filter((m) => m.kind === 'sheet');
    const facMats = store.settings.materials.filter((m) => m.kind === 'facade' || m.kind === 'sheet');
    const curCorpus = sheetMats.find((m) => m.id === defCorpus);
    const curFacade = facMats.find((m) => m.id === defFacade);

    topBar.append(
      h('div', { class: 'sk-tb-group' },
        h('button', {
          type: 'button', class: 'sk-ib', title: 'Отменить', disabled: undoStack.length === 0,
          onClick: () => {
            const prev = undoStack.pop();
            if (!prev) return;
            redoStack.push(JSON.stringify(draftMods));
            draftMods = JSON.parse(prev);
            renderAll();
          },
        }, icon('undo', 16)),
        h('button', {
          type: 'button', class: 'sk-ib', title: 'Повторить', disabled: redoStack.length === 0,
          onClick: () => {
            const nxt = redoStack.pop();
            if (!nxt) return;
            undoStack.push(JSON.stringify(draftMods));
            draftMods = JSON.parse(nxt);
            renderAll();
          },
        }, icon('redo', 16)),
        h('span', { class: 'sk-sep' }),
        h('button', {
          type: 'button', class: `sk-ib ${activeTool === 'select' ? 'on' : ''}`, title: 'Указатель: двигать и растягивать',
          onClick: () => { activeTool = 'select'; renderTopBar(); renderCanvas(); },
        }, '⬈ Выбор'),
        h('button', {
          type: 'button', class: `sk-ib ${activeTool === 'draw' ? 'on' : ''}`, title: 'Карандаш: рисуйте прямоугольник или линию внутри шкафа',
          onClick: () => { activeTool = 'draw'; renderTopBar(); renderCanvas(); },
        }, '✎ Рисовать'),
        h('button', {
          type: 'button', class: 'sk-ib danger', title: 'Удалить выбранный (Del)', disabled: !selectedId,
          onClick: () => {
            if (!selectedId) return;
            snapshotUndo();
            draftMods = draftMods.filter((m) => m.id !== selectedId);
            selectedId = wallMods()[0]?.id ?? null;
            renderAll();
          },
        }, icon('trash', 15)),
      ),
      h('div', { class: 'sk-wall-tabs' },
        ...(['back', 'left', 'right'] as const).map((wId) =>
          h('button', {
            type: 'button',
            class: `sk-wtab ${activeWall === wId ? 'on' : ''}`,
            onClick: () => {
              activeWall = wId;
              selectedId = wallMods()[0]?.id ?? null;
              ctxPopup.style.display = 'none';
              renderAll();
            },
          }, wId === 'back' ? `Задняя (${room.w} мм)` : wId === 'left' ? `Левая Г-крыло (${room.d} мм)` : `Правая (${room.d} мм)`),
        ),
      ),
      h('div', { class: 'sk-tb-group' },
        h('label', { class: 'sk-mat-pill', title: 'Материал корпуса' },
          h('span', { class: 'mat-swatch', style: `background:${curCorpus?.color ?? '#fff'};` }),
          h('select', {
            onChange: (e: Event) => {
              defCorpus = (e.target as HTMLSelectElement).value;
              snapshotUndo();
              draftMods.forEach((m) => { m.matCorpus = defCorpus; });
              renderAll();
            },
          }, ...sheetMats.map((mt) => h('option', { value: mt.id, selected: mt.id === defCorpus }, mt.name))),
        ),
        h('label', { class: 'sk-mat-pill', title: 'Материал фасада' },
          h('span', { class: 'mat-swatch', style: `background:${curFacade?.color ?? '#fff'};` }),
          h('select', {
            onChange: (e: Event) => {
              defFacade = (e.target as HTMLSelectElement).value;
              snapshotUndo();
              draftMods.forEach((m) => { m.matFacade = defFacade; });
              renderAll();
            },
          }, ...facMats.map((mt) => h('option', { value: mt.id, selected: mt.id === defFacade }, mt.name))),
        ),
        h('label', { class: 'sk-depth-pill' },
          h('span', null, 'Глубина'),
          h('input', {
            type: 'number', min: 150, max: 800, step: 10, value: String(defaultDepth),
            onChange: (e: Event) => { defaultDepth = Math.max(150, Math.min(800, Number((e.target as HTMLInputElement).value) || 500)); },
          }),
        ),
        h('button', { type: 'button', class: 'sk-ib', title: 'Закрыть 2D-режим', onClick: closeOverlay }, icon('x', 16)),
      ),
    );
  };

  const renderLeftPanel = () => {
    clear(leftPanel);
    const tabs = h('div', { class: 'sk-left-tabs' },
      ...([['kitchen', 'Кухня'], ['wardrobe', 'Гардероб'], ['fill', 'Наполнение']] as const).map(([id, lbl]) =>
        h('button', {
          type: 'button', class: `sk-ltab ${activeTab === id ? 'on' : ''}`,
          onClick: () => { activeTab = id; renderLeftPanel(); },
        }, lbl),
      ),
    );

    const gridWrap = h('div', { class: 'sk-left-scroll' });
    if (activeTab === 'fill') {
      const m = selectedMod();
      const applyFill = (fn: (mod: Module) => void) => {
        if (!m) { toast('Сначала выберите модуль на чертеже', 'err'); return; }
        snapshotUndo();
        fn(m);
        renderAll();
      };
      const fillAction = (title: string, sub: string, fn: (mod: Module) => void) =>
        h('button', { type: 'button', class: 'sk-fill-btn', onClick: () => applyFill(fn) },
          h('b', null, title),
          h('small', null, sub),
        );

      gridWrap.append(
        h('div', { class: 'sk-grp-title' }, m ? `Выбран: ${m.name}` : 'Выберите шкаф на чертеже'),
        h('div', { class: 'sk-fill-grid' },
          fillAction('+ Полка', 'Добавить 1 полку', (mod) => { mod.sections[0].shelves = Math.min(12, mod.sections[0].shelves + 1); }),
          fillAction('2 полки', 'Стандарт верх', (mod) => { mod.sections[0].shelves = 2; }),
          fillAction('Штанга', 'Вешалка', (mod) => { mod.sections[0].rod = true; mod.sections[0].rods = 1; }),
          fillAction('2 ящика', 'Выдвижные', (mod) => { mod.sections[0].drawers = 2; mod.doorMode = 'none'; mod.drawerH = Math.round((mod.h - mod.plinth) / 2); }),
          fillAction('3 ящика', 'Выдвижные', (mod) => { mod.sections[0].drawers = 3; mod.doorMode = 'none'; mod.drawerH = Math.round((mod.h - mod.plinth) / 3); }),
          fillAction('Сушка в ящике', 'В нижнем ящике', (mod) => { mod.sections[0].drawers = 2; mod.doorMode = 'none'; if (!/сушк/i.test(mod.name)) mod.name += ' (сушка)'; }),
          fillAction('1 дверь (прав.)', 'От угла', (mod) => { mod.doorMode = 'hinged'; mod.doorCount = 1; mod.hinge = 'right'; mod.sections[0].door = true; }),
          fillAction('1 дверь (лев.)', 'Петли слева', (mod) => { mod.doorMode = 'hinged'; mod.doorCount = 1; mod.hinge = 'left'; mod.sections[0].door = true; }),
          fillAction('2 двери', 'Распашные', (mod) => { mod.doorMode = 'hinged'; mod.doorCount = 2; mod.sections[0].door = true; }),
          fillAction('Угол слева 50мм', 'Заход 550мм', (mod) => { mod.blindSide = 'left'; mod.blindW = isWall(mod.kind) ? 350 : 550; mod.blindFillerW = 50; }),
          fillAction('Угол справа 50мм', 'Заход вправо', (mod) => { mod.blindSide = 'right'; mod.blindW = 50; mod.blindFillerW = 50; }),
          fillAction('Push-to-Open', 'Без ручек', (mod) => { mod.handles = !mod.handles; }),
        ),
      );
    } else {
      const list = SKETCH_PRESETS.filter((p) => p.tab === activeTab);
      const byGroup = new Map<string, SketchPreset[]>();
      list.forEach((p) => {
        const arr = byGroup.get(p.group) ?? [];
        arr.push(p);
        byGroup.set(p.group, arr);
      });
      byGroup.forEach((items, grp) => {
        gridWrap.append(h('div', { class: 'sk-grp-title' }, grp));
        const cards = h('div', { class: 'sk-cards-grid' });
        items.forEach((item) => {
          const card = h('button', {
            type: 'button',
            class: 'sk-card',
            title: `Добавить «${item.label}» на активную стену`,
            onClick: () => {
              snapshotUndo();
              const mod = item.make(activeWall, defCorpus, defFacade, defTop, defaultDepth);
              mod.x = findNextFreeX(mod.w, mod.lift, mod.h);
              draftMods.push(mod);
              selectedId = mod.id;
              renderAll();
            },
          });
          const thumb = h('div', { class: 'sk-card-img' });
          thumb.innerHTML = item.svgThumb;
          card.append(thumb, h('span', { class: 'sk-card-lbl' }, item.label));
          cards.append(card);
        });
        gridWrap.append(cards);
      });
    }
    leftPanel.append(tabs, gridWrap);
  };

  const renderRightInspector = () => {
    clear(rightInspector);
    const m = selectedMod();
    if (!m) {
      rightInspector.append(h('div', { class: 'sk-r-empty' }, 'Кликните по модулю на чертеже или нарисуйте новый блок карандашом ✎.'));
      return;
    }
    const upd = (fn: (mod: Module) => void) => {
      snapshotUndo();
      fn(m);
      renderAll();
    };
    const rField = (lbl: string, val: number, min: number, max: number, onSet: (v: number) => void) =>
      h('label', { class: 'sk-rfld' },
        h('span', null, lbl),
        h('input', {
          type: 'number', min, max, step: 10, value: String(val),
          onChange: (e: Event) => onSet(Math.max(min, Math.min(max, Math.round(Number((e.target as HTMLInputElement).value) || val)))),
        }),
      );

    rightInspector.append(
      h('div', { class: 'sk-r-title' }, m.name),
      h('div', { class: 'sk-r-grid' },
        rField('Позиция X', m.x, 0, wallLen(), (v) => upd((x) => { x.x = v; })),
        rField('От пола Y', m.lift, 0, 2600, (v) => upd((x) => { x.lift = v; })),
        rField('Ширина W', m.w, 50, 3000, (v) => upd((x) => { x.w = v; })),
        rField('Высота H', m.h, 150, 2800, (v) => upd((x) => { x.h = v; })),
        rField('Глубина D', m.d, 150, 800, (v) => upd((x) => { x.d = v; })),
        rField('Цоколь', m.plinth, 0, 200, (v) => upd((x) => { x.plinth = v; })),
      ),
      h('div', { class: 'sk-r-actions' },
        h('button', {
          type: 'button', class: 'sk-qbtn',
          onClick: () => upd((x) => { x.handles = !x.handles; }),
        }, m.handles ? 'Ручки: Да' : 'Push-to-Open'),
        h('button', {
          type: 'button', class: 'sk-qbtn',
          onClick: () => upd((x) => { x.doorCount = x.doorCount === 1 ? 2 : 1; }),
        }, `Дверей: ${m.doorCount ?? 'Авто'}`),
      ),
      h('button', {
        type: 'button', class: 'sk-qbtn', style: 'width:100%; margin-top:4px;',
        onClick: () => {
          snapshotUndo();
          const copy: Module = JSON.parse(JSON.stringify(m));
          copy.id = uid();
          copy.x = m.x + m.w;
          draftMods.push(copy);
          selectedId = copy.id;
          renderAll();
        },
      }, 'Дублировать рядом →'),
    );
  };

  const renderBottomBar = () => {
    clear(bottomBar);
    bottomBar.append(
      h('span', { class: 'sk-hint' }, 'Ведите прямоугольник — создать шкаф · Внутри шкафа: вертикально — перегородка, вбок — полка, наискосок — быстрое меню фасада · ПКМ/Колёсико — панорама/масштаб'),
      h('div', { class: 'sk-bottom-btns' },
        h('button', {
          type: 'button', class: 'btn ghost sm',
          onClick: () => {
            if (!wallMods().length) return;
            snapshotUndo();
            draftMods = draftMods.filter((m) => (m.wall ?? 'back') !== activeWall);
            selectedId = null;
            renderAll();
          },
        }, 'Очистить стену'),
        h('button', {
          type: 'button', class: 'btn primary', style: 'font-weight:700;',
          onClick: () => {
            store.commit((p) => {
              p.modules = draftMods;
            }, 'sketch-2d');
            if (draftMods[0]) store.select(draftMods[0].id);
            viewer.frame('iso');
            toast(`3D-модель обновлена (${draftMods.length} модулей)`);
            closeOverlay();
          },
        }, icon('cube', 16), 'Создать 3D-модель'),
      ),
    );
  };

  const renderAll = () => {
    renderTopBar();
    renderLeftPanel();
    renderCanvas();
    renderRightInspector();
    renderBottomBar();
  };

  // Мышь на холсте (рисование, перемещение, растяжение, диагональ, панорама, зум)
  svgHost.addEventListener('pointerdown', (e: PointerEvent) => {
    const rect = svgHost.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (e.button === 1 || e.button === 2) {
      drawState = { mode: 'pan', startPx: px, startPy: py, curPx: px, curPy: py, origPanX: panX, origPanY: panY };
      svgHost.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    ctxPopup.style.display = 'none';

    const target = e.target as Element;
    const hr = target.closest<SVGElement>('.sk-h-r');
    if (hr) {
      const m = draftMods.find((x) => x.id === hr.dataset.id);
      if (m) {
        snapshotUndo();
        drawState = { mode: 'resize-r', modId: m.id, startPx: px, startPy: py, curPx: px, curPy: py, origW: m.w };
        svgHost.setPointerCapture(e.pointerId);
        return;
      }
    }
    const ht = target.closest<SVGElement>('.sk-h-t');
    if (ht) {
      const m = draftMods.find((x) => x.id === ht.dataset.id);
      if (m) {
        snapshotUndo();
        drawState = { mode: 'resize-t', modId: m.id, startPx: px, startPy: py, curPx: px, curPy: py, origH: m.h };
        svgHost.setPointerCapture(e.pointerId);
        return;
      }
    }

    const modEl = target.closest<SVGElement>('.sk-mod');
    if (modEl && activeTool === 'select') {
      const m = draftMods.find((x) => x.id === modEl.dataset.id);
      if (m) {
        selectedId = m.id;
        snapshotUndo();
        drawState = { mode: 'move', modId: m.id, startPx: px, startPy: py, curPx: px, curPy: py, origX: m.x, origY: m.lift };
        svgHost.setPointerCapture(e.pointerId);
        renderAll();
        return;
      }
    }

    if (activeTool === 'draw') {
      drawState = {
        mode: 'new',
        modId: modEl?.dataset.id,
        startPx: px, startPy: py, curPx: px, curPy: py,
      };
      svgHost.setPointerCapture(e.pointerId);
    } else {
      selectedId = null;
      renderAll();
    }
  });

  svgHost.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drawState) return;
    const rect = svgHost.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    drawState.curPx = px;
    drawState.curPy = py;

    if (drawState.mode === 'pan') {
      panX = (drawState.origPanX ?? 0) + (px - drawState.startPx);
      panY = (drawState.origPanY ?? 0) + (py - drawState.startPy);
      renderCanvas();
    } else if (drawState.mode === 'move' && drawState.modId) {
      const m = draftMods.find((x) => x.id === drawState?.modId);
      if (m) {
        const dxMm = Math.round(((px - drawState.startPx) / scale) / 10) * 10;
        const dyMm = Math.round(((drawState.startPy - py) / scale) / 10) * 10;
        m.x = snapX((drawState.origX ?? 0) + dxMm, m.id, m.w, m.lift, m.h);
        m.lift = snapY((drawState.origY ?? 0) + dyMm, m.id, m.h);
        renderCanvas();
        renderRightInspector();
      }
    } else if (drawState.mode === 'resize-r' && drawState.modId) {
      const m = draftMods.find((x) => x.id === drawState?.modId);
      if (m) {
        const dxMm = Math.round(((px - drawState.startPx) / scale) / 10) * 10;
        m.w = Math.max(50, Math.min(3000, (drawState.origW ?? 600) + dxMm));
        renderCanvas();
        renderRightInspector();
      }
    } else if (drawState.mode === 'resize-t' && drawState.modId) {
      const m = draftMods.find((x) => x.id === drawState?.modId);
      if (m) {
        const dyMm = Math.round(((drawState.startPy - py) / scale) / 10) * 10;
        m.h = Math.max(150, Math.min(2800, (drawState.origH ?? 820) + dyMm));
        renderCanvas();
        renderRightInspector();
      }
    } else if (drawState.mode === 'new') {
      renderCanvas();
    }
  });

  svgHost.addEventListener('pointerup', (e: PointerEvent) => {
    if (!drawState) return;
    const st = drawState;
    drawState = null;
    if (st.mode !== 'new') return;

    const dx = st.curPx - st.startPx;
    const dy = st.curPy - st.startPy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Клик внутри существующего модуля (без рисования нового) -> выделение или жест внутри
    if (st.modId) {
      const targetMod = draftMods.find((x) => x.id === st.modId);
      if (targetMod) {
        selectedId = targetMod.id;
        if (adx < 12 && ady < 12) {
          renderAll();
          return;
        }
        // Линия внутри шкафа: вертикально = перегородка, горизонтально = полка, наискосок = меню фасада!
        if (ady > adx * 2.1 && ady > 22) {
          snapshotUndo();
          if (targetMod.sections.length < 4) {
            targetMod.sections.push(sec({ shelves: targetMod.sections[0].shelves }));
            toast(`Добавлена секция (${targetMod.sections.length})`);
          }
          renderAll();
          return;
        }
        if (adx > ady * 2.1 && adx > 22) {
          snapshotUndo();
          targetMod.sections[0].shelves = Math.min(12, targetMod.sections[0].shelves + 1);
          toast(`Добавлена полка (${targetMod.sections[0].shelves})`);
          renderAll();
          return;
        }
        // Диагональ внутри модуля -> открываем быстрое меню двери/ящиков/угла у курсора!
        openQuickDiagPopup(targetMod, e.clientX, e.clientY);
        renderAll();
        return;
      }
    }

    // Если рисовали на свободном месте достаточный прямоугольник -> создаём новый модуль
    if (adx > 16 || ady > 16) {
      const p1 = toMm(st.startPx, st.startPy);
      const p2 = toMm(st.curPx, st.curPy);
      const mx = Math.max(0, Math.min(p1.x, p2.x));
      const myBot = Math.max(0, Math.min(p1.y, p2.y));
      const rawW = Math.max(200, Math.abs(p2.x - p1.x));
      const rawH = Math.max(250, Math.abs(p2.y - p1.y));
      const isUpper = myBot >= 950;
      const isTallMod = rawH >= 1500 && myBot <= 100;
      const kind: Kind = isTallMod ? 'tall' : isUpper ? 'wall' : 'base';

      snapshotUndo();
      const newMod: Module = {
        id: uid(),
        name: kind === 'tall' ? `Пенал ${rawW}` : kind === 'wall' ? `Верхний шкаф ${rawW}` : `Нижний модуль ${rawW}`,
        kind,
        wall: activeWall === 'back' ? undefined : activeWall,
        x: mx,
        w: rawW,
        h: rawH,
        d: kind === 'wall' ? 300 : defaultDepth,
        plinth: kind === 'wall' ? 0 : 100,
        lift: kind === 'wall' ? myBot : 0,
        t: 16,
        mirror: false,
        doorMode: 'hinged',
        slidingCount: 2,
        drawerH: 200,
        handles: kind !== 'wall',
        countertop: kind === 'base',
        matCorpus: defCorpus,
        matFacade: defFacade,
        matBack: 'b-white',
        matTop: defTop,
        sections: [sec({ shelves: kind === 'wall' ? 2 : 1 })],
      };
      draftMods.push(newMod);
      selectedId = newMod.id;
      renderAll();
      openQuickDiagPopup(newMod, e.clientX, e.clientY);
    }
  });

  svgHost.addEventListener('contextmenu', (e) => e.preventDefault());
  svgHost.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    scale = Math.max(0.08, Math.min(0.65, scale * factor));
    renderCanvas();
  }, { passive: false });

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Escape') {
      if (ctxPopup.style.display !== 'none') ctxPopup.style.display = 'none';
      else closeOverlay();
    } else if (e.key === 'Delete' && selectedId) {
      snapshotUndo();
      draftMods = draftMods.filter((m) => m.id !== selectedId);
      selectedId = wallMods()[0]?.id ?? null;
      renderAll();
    }
  };
  window.addEventListener('keydown', onKey);

  // Центрируем стену на экране после монтирования
  requestAnimationFrame(() => {
    const r = canvasWrap.getBoundingClientRect();
    scale = Math.max(0.14, Math.min(0.32, Math.min((r.width - 140) / Math.max(1800, wallLen()), (r.height - 160) / Math.max(2400, room.h))));
    panX = Math.max(60, (r.width - wallLen() * scale) / 2);
    panY = r.height - 82;
    renderAll();
  });
}
