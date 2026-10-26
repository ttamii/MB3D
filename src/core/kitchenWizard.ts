import type { RoomConfig } from './room';
import type { Module, Section } from './types';
import { uid } from './util';

export interface KitchenWizardOptions {
  wallLength: number; // мм (например 2400, 3000, 3600)
  tiers: 2 | 3;       // 2 яруса (низ + верх) или 3 яруса (низ + верх + антресоли)
  facadeMat: string;  // id материала фасадов
  corpusMat: string;  // id материала корпуса
  topMat: string;     // id столешницы
  plinthColor: 'facade' | 'corpus';
  millingMix: 'trend' | 'modern' | 'frame' | 'ribbed'; // 'trend' = внизу рамка, вверху модерн, антресоль рифлёная
  layoutVariant: number; // 0: пенал слева, 1: пенал справа, 2: без пенала
}

export interface KitchenPlan {
  modules: Module[];
  /** Что алгоритм изменил или пропустил из-за помещения (окна, двери, потолок). */
  notes: string[];
}

const BASE_H = 820;
const COUNTERTOP_H = 38;
const WALL_LIFT = 1450;
const WALL_H = 720;
const TALL_W = 600;
const MIN_W = 300;
const DOOR_GAP = 50;

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return { shelves: 0, drawers: 0, rod: rods > 0, rods, door: true, ...p };
};

interface Seg { x0: number; x1: number }

/** Свободные участки задней стены: без дверных проёмов и зон открывания боковых дверей. */
function freeSegments(total: number, room: RoomConfig | undefined, notes: string[]): Seg[] {
  if (!room) return [{ x0: 0, x1: total }];

  let x0 = 0;
  let x1 = Math.min(total, room.w);
  if (total > room.w) notes.push(`Длина стены ${total} мм больше комнаты, использовано ${room.w} мм.`);

  // Боковая дверь, которая выходит в зону шкафов (глубина 560), перекрывается шкафом у стены
  for (const d of room.doors) {
    if (d.wall === 'back' || d.x >= 600) continue;
    const clear = d.w + 20;
    if (d.wall === 'left') x0 = Math.max(x0, clear);
    else x1 = Math.min(x1, room.w - clear);
    notes.push(`Дверь на ${d.wall === 'left' ? 'левой' : 'правой'} стене: оставлен проход ${clear} мм.`);
  }

  let segs: Seg[] = [{ x0, x1 }];
  for (const d of room.doors.filter((q) => q.wall === 'back')) {
    const a = d.x - DOOR_GAP;
    const b = d.x + d.w + DOOR_GAP;
    segs = segs.flatMap((s) => {
      if (b <= s.x0 || a >= s.x1) return [s];
      const out: Seg[] = [];
      if (a - s.x0 >= MIN_W) out.push({ x0: s.x0, x1: a });
      if (s.x1 - b >= MIN_W) out.push({ x0: b, x1: s.x1 });
      return out;
    });
    notes.push(`Дверь на задней стене: участок ${Math.round(d.x)}-${Math.round(d.x + d.w)} мм свободен.`);
  }
  return segs.filter((s) => s.x1 - s.x0 >= MIN_W);
}

/** Делит участок на модули 400-800 мм без остатка; последний забирает округление. */
function splitWidths(len: number, minCount = 1): number[] {
  const lo = Math.max(minCount, Math.ceil(len / 800));
  const hi = Math.max(lo, Math.floor(len / 400));
  const n = Math.min(hi, Math.max(lo, Math.round(len / 600)));
  const w = Math.floor(len / n / 10) * 10;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? len - w * (n - 1) : w));
}

export function planKitchen(opts: KitchenWizardOptions, room?: RoomConfig): KitchenPlan {
  const { tiers, facadeMat, corpusMat, topMat, plinthColor, millingMix, layoutVariant } = opts;
  const notes: string[] = [];
  const modules: Module[] = [];

  const total = Math.max(1600, opts.wallLength);
  const backWins = (room?.windows ?? []).filter((w) => w.wall === 'back');
  const hitsWindow = (x0: number, x1: number, y0: number, y1: number): boolean =>
    backWins.some((w) => x0 < w.x + w.w && x1 > w.x && y0 < w.lift + w.h && y1 > w.lift);

  // Высоты ярусов от потолка
  const ceiling = room?.h ?? 2530;
  const topY = Math.min(ceiling, 2530);
  const upperH = Math.min(WALL_H, ceiling - WALL_LIFT);
  const mezzLift = WALL_LIFT + WALL_H;
  const mezzH = topY - mezzLift;
  const useMezz = tiers === 3 && mezzH >= 200;
  if (tiers === 3 && !useMezz) notes.push(`Потолок ${ceiling} мм: антресоли не помещаются, оставлено 2 яруса.`);
  const tallH = useMezz ? topY : Math.min(2170, ceiling - 30);
  const wallsOk = upperH >= 400;
  if (!wallsOk) notes.push('Потолок слишком низкий для верхних шкафов.');

  const bottomMilling = millingMix === 'trend' ? 'frame' : millingMix;
  const upperMilling = millingMix === 'trend' ? 'modern' : millingMix;
  const mezzMilling = millingMix === 'trend' ? 'ribbed' : millingMix;

  const segs = freeSegments(total, room, notes);
  if (!segs.length) {
    notes.push('На задней стене нет свободного места под кухню.');
    return { modules, notes };
  }

  const common = {
    mirror: false, t: 16, slidingCount: 2, drawerH: 200, matCorpus: corpusMat,
    matFacade: facadeMat, matBack: 'b-white', matTop: topMat,
  };

  // Пенал: у начала первого участка (вариант 0) или у конца последнего (вариант 1)
  const work: Seg[] = segs.map((s) => ({ ...s }));
  if (layoutVariant !== 2) {
    const idx = layoutVariant === 0 ? 0 : work.length - 1;
    const s = work[idx];
    if (s.x1 - s.x0 >= 2200) {
      const atLeft = layoutVariant === 0;
      const tx = atLeft ? s.x0 : s.x1 - TALL_W;
      if (hitsWindow(tx, tx + TALL_W, 0, tallH)) {
        notes.push('Пенал не поставлен: на этом месте окно.');
      } else {
        modules.push({
          id: uid(), name: 'Пенал с нишей под духовку/СВЧ', kind: 'tall', x: tx, hinge: atLeft ? 'right' : 'left',
          w: TALL_W, h: tallH, d: 560, plinth: 100, lift: 0, sections: [sec({ drawers: 1, shelves: 3, door: true })],
          doorMode: 'hinged', handles: true, countertop: false, milling: bottomMilling, plinthColor, ...common,
        });
        if (atLeft) s.x0 += TALL_W; else s.x1 -= TALL_W;
      }
    }
  }

  let slot = 0;
  for (const s of work) {
    const len = s.x1 - s.x0;
    if (len < MIN_W) continue;
    let x = s.x0;
    for (const w of splitWidths(len, slot === 0 && work.length === 1 ? 2 : 1)) {
      let baseName = `Нижний шкаф ${slot + 1}`;
      let baseSections = [sec({ shelves: 1, door: true })];
      let baseDoorMode: 'none' | 'hinged' = 'hinged';
      let baseDrH = 200;
      let upperName = `Верхний шкаф ${slot + 1}`;

      if (slot === 0) {
        baseName = 'Модуль под мойку';
        baseSections = [sec({ shelves: 0, door: true })];
        upperName = 'Сушка для посуды (2 яруса)';
      } else if (slot === 1) {
        baseName = 'Модуль с 3 ящиками (приборы + кастрюли)';
        baseSections = [sec({ drawers: 3, door: false })];
        baseDoorMode = 'none';
        baseDrH = 240;
      } else if (slot === 2) {
        baseName = 'Модуль под варочную поверхность';
        baseSections = [sec({ shelves: 1, drawers: 1, door: false })];
        baseDoorMode = 'none';
        baseDrH = 160;
        upperName = 'Шкаф под вытяжку';
      }

      if (hitsWindow(x, x + w, 0, BASE_H + COUNTERTOP_H)) {
        notes.push(`Окно ниже столешницы (${BASE_H + COUNTERTOP_H} мм): проверьте подоконник на участке ${x}-${x + w} мм.`);
      }

      modules.push({
        ...common, id: uid(), name: baseName, kind: 'base', x, w, h: BASE_H, d: 560, plinth: 100, lift: 0,
        sections: baseSections, doorMode: baseDoorMode, drawerH: baseDrH, handles: true, countertop: true,
        milling: bottomMilling, plinthColor,
      });

      if (wallsOk) {
        if (hitsWindow(x, x + w, WALL_LIFT, WALL_LIFT + upperH)) {
          notes.push(`Верхний шкаф ${x}-${x + w} мм пропущен: окно.`);
        } else {
          modules.push({
            id: uid(), name: upperName, kind: 'wall', x, w, h: upperH, d: 320, plinth: 0, lift: WALL_LIFT,
            sections: [sec({ shelves: 2, door: true })], doorMode: 'hinged', handles: true, countertop: false,
            milling: upperMilling, ...common,
          });
        }
      }

      if (useMezz) {
        if (hitsWindow(x, x + w, mezzLift, topY)) {
          notes.push(`Антресоль ${x}-${x + w} мм пропущена: окно.`);
        } else {
          modules.push({
            id: uid(), name: `Антресоль ${slot + 1} (push-to-open)`, kind: 'wall', x, w, h: mezzH, d: 560, plinth: 0,
            lift: mezzLift, sections: [sec({ shelves: 0, door: true })], doorMode: 'hinged', handles: false,
            countertop: false, milling: mezzMilling, ...common,
          });
        }
      }

      x += w;
      slot++;
    }
  }

  return { modules, notes };
}

export function generateKitchenLayout(opts: KitchenWizardOptions, room?: RoomConfig): Module[] {
  return planKitchen(opts, room).modules;
}
