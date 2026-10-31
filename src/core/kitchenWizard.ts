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
  layoutVariant: number; // 0: пенал слева (при прямой) / справа (при угловой), 1: пенал справа, 2: без пенала
  shape?: 'linear' | 'corner-left'; // Форма гарнитура: Прямая или Угловая Г-образная
  topTrimH?: number; // Высота верхней доборной планки / карниза под потолок (0 = нет, например 60 мм)
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

/**
 * Делит участок на стандартные кухонные модули (приоритет 800 мм для двухдверной мойки/сушки посуды
 * и 600 мм для бытовой техники и ящиков) строго без остатка.
 */
function splitWidths(len: number, minCount = 1): number[] {
  if (len < 750 && minCount <= 1) return [len];
  const lo = Math.max(minCount, Math.ceil(len / 850));
  const hi = Math.max(lo, Math.floor(len / 400));
  const n = Math.min(hi, Math.max(lo, Math.round(len / 680)));
  if (n <= 1) return [len];

  // Предпочтительные ширины: слот 0 (мойка + двухдверная сушка) = 800 мм, последний слот на больших кухнях = 800 мм
  const widths = Array.from({ length: n }, (_, i) => {
    if (i === 0 && len >= n * 520 + 180) return 800;
    if (i === n - 1 && n >= 4 && len >= 2900) return 800;
    if (i === 1 && n >= 5 && len >= 3600) return 800;
    return 600;
  });

  let diff = len - widths.reduce((a, b) => a + b, 0);
  // Распределяем разницу по гибким модулям (в пределах 400..850 мм), сохраняя 800 мм у сушки и 600 мм у духовки (слот 2)
  const flexOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const prio = (idx: number) => (idx === 2 ? 10 : idx === 0 ? 8 : idx === n - 1 ? 5 : 1);
    return prio(a) - prio(b);
  });

  for (const idx of flexOrder) {
    if (diff === 0) break;
    const minW = len / n < 420 ? 300 : 400;
    const maxW = 850;
    const take = Math.max(minW - widths[idx], Math.min(maxW - widths[idx], diff));
    const roundedTake = Math.trunc(take / 10) * 10;
    widths[idx] += roundedTake;
    diff -= roundedTake;
  }
  if (diff !== 0) {
    widths[widths.length - 1] += diff;
  }
  return widths;
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

  const isCorner = opts.shape === 'corner-left';
  if (isCorner) {
    if (room && room.d < 1100) {
      notes.push('Глубина комнаты меньше 1100 мм: угловой модуль выступает на 900 мм.');
    }
    const leftDoor = room?.doors.find((d) => d.wall === 'left' && d.x < 950);
    if (leftDoor) {
      notes.push('Дверь на левой стене рядом с углом может блокироваться шкафом.');
    }
  }

  // Пенал: у начала первого участка (вариант 0 при прямой) или у конца последнего (вариант 1)
  const work: Seg[] = segs.map((s) => ({ ...s }));

  if (isCorner) {
    const s0 = work[0];
    if (s0 && s0.x1 - s0.x0 >= 1500) {
      const cx = s0.x0;
      modules.push({
        ...common,
        id: uid(),
        name: 'Угловой нижний шкаф (900×900)',
        kind: 'corner',
        x: cx,
        w: 900,
        h: BASE_H,
        d: 560,
        plinth: 100,
        lift: 0,
        sections: [sec({ shelves: 1, door: true })],
        doorMode: 'hinged',
        drawerH: 200,
        handles: true,
        countertop: true,
        milling: bottomMilling,
        plinthColor,
      });

      if (wallsOk) {
        if (!hitsWindow(cx, cx + 600, WALL_LIFT, WALL_LIFT + upperH)) {
          modules.push({
            id: uid(),
            name: 'Угловой верхний шкаф (600×600)',
            kind: 'cornerWall',
            x: cx,
            w: 600,
            h: upperH,
            d: 320,
            plinth: 0,
            lift: WALL_LIFT,
            sections: [sec({ shelves: 2, door: true })],
            doorMode: 'hinged',
            handles: true,
            countertop: false,
            milling: upperMilling,
            ...common,
          });
        }
        if (!hitsWindow(cx + 600, cx + 900, WALL_LIFT, WALL_LIFT + upperH)) {
          modules.push({
            id: uid(),
            name: 'Верхний шкаф 300 мм',
            kind: 'wall',
            x: cx + 600,
            w: 300,
            h: upperH,
            d: 320,
            plinth: 0,
            lift: WALL_LIFT,
            sections: [sec({ shelves: 2, door: true })],
            doorMode: 'hinged',
            handles: true,
            countertop: false,
            milling: upperMilling,
            ...common,
          });
        }
      }

      if (useMezz) {
        if (!hitsWindow(cx, cx + 600, mezzLift, topY)) {
          modules.push({
            id: uid(),
            name: 'Антресоль над углом (газлифт)',
            kind: 'wall',
            x: cx,
            w: 600,
            h: mezzH,
            d: 560,
            plinth: 0,
            lift: mezzLift,
            sections: [sec({ shelves: 0, door: true })],
            doorMode: 'hinged',
            hinge: 'top',
            handles: false,
            countertop: false,
            milling: mezzMilling,
            ...common,
          });
        }
        if (!hitsWindow(cx + 600, cx + 900, mezzLift, topY)) {
          modules.push({
            id: uid(),
            name: 'Антресоль 300 мм (газлифт)',
            kind: 'wall',
            x: cx + 600,
            w: 300,
            h: mezzH,
            d: 560,
            plinth: 0,
            lift: mezzLift,
            sections: [sec({ shelves: 0, door: true })],
            doorMode: 'hinged',
            hinge: 'top',
            handles: false,
            countertop: false,
            milling: mezzMilling,
            ...common,
          });
        }
      }

      s0.x0 += 900;
    } else {
      notes.push('Длины стены недостаточно для углового шкафа (требуется от 1500 мм), построена прямая кухня.');
    }
  }

  if (layoutVariant !== 2) {
    const atLeft = !isCorner && layoutVariant === 0;
    const idx = atLeft ? 0 : work.length - 1;
    const s = work[idx];
    if (s && s.x1 - s.x0 >= (isCorner ? 1200 : 2200)) {
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

  const tallAtLeft = layoutVariant !== 2 && !isCorner && layoutVariant === 0;
  const tallAtRight = layoutVariant !== 2 && (isCorner || layoutVariant === 1);

  let slot = 0;
  for (const s of work) {
    const len = s.x1 - s.x0;
    if (len < MIN_W) continue;
    let x = s.x0;
    const slotWidths = splitWidths(len, slot === 0 && work.length === 1 ? 2 : 1);
    for (let wi = 0; wi < slotWidths.length; wi++) {
      const w = slotWidths[wi];
      let baseName = w >= 700 ? `Двухдверная тумба ${slot + 1}` : `Нижний шкаф ${slot + 1}`;
      let baseSections = [sec({ shelves: 1, door: true })];
      let baseDoorMode: 'none' | 'hinged' = 'hinged';
      let baseDrH = 200;
      let upperName = w >= 700 ? `Двухдверный шкаф для посуды ${slot + 1}` : `Верхний шкаф ${slot + 1}`;

      if (slot === 0) {
        baseName = w >= 700 ? 'Модуль под мойку (2 двери)' : 'Модуль под мойку';
        baseSections = [sec({ shelves: 0, door: true })];
        upperName = 'Двухдверный шкаф-сушка для посуды (2 яруса)';
      } else if (slot === 1) {
        baseName = 'Модуль с 3 ящиками (приборы + кастрюли)';
        baseSections = [sec({ drawers: 3, door: false })];
        baseDoorMode = 'none';
        baseDrH = 240;
        upperName = w >= 700 ? 'Двухдверный шкаф для бокалов и посуды' : 'Шкаф для бокалов и бакалеи';
      } else if (slot === 2) {
        baseName = 'Модуль под варочную поверхность';
        baseSections = [sec({ shelves: 1, drawers: 1, door: false })];
        baseDoorMode = 'none';
        baseDrH = 160;
        upperName = 'Шкаф под встроенную вытяжку';
      } else if (slot === 3) {
        if (w >= 700) {
          baseName = 'Двухдверная тумба для посуды и кастрюль';
          upperName = 'Двухдверный шкаф для посуды и сервиза';
        } else {
          baseName = 'Модуль под ПММ / Отсек хранения';
          upperName = 'Шкаф для посуды и хранения';
        }
      } else if (slot === 4) {
        if (w >= 700) {
          baseName = 'Двухдверная база хранения (2 створки)';
          upperName = 'Двухдверный шкаф для посуды (2 створки)';
        } else {
          baseName = 'Доп. модуль с 3 ящиками';
          baseSections = [sec({ drawers: 3, door: false })];
          baseDoorMode = 'none';
          baseDrH = 240;
          upperName = 'Верхний шкаф для запасов';
        }
      }

      // Умная ориентация петель для однодверных шкафов:
      // если слева стоит глубокий пенал или угол — петли справа (открывание ОТ пенала),
      // если справа стоит пенал или стена — петли слева (открывание ОТ правого края)
      let smartHinge: 'left' | 'right' = slot % 2 === 0 ? 'left' : 'right';
      if (wi === 0 && (tallAtLeft || isCorner)) {
        smartHinge = 'right';
      } else if (wi === slotWidths.length - 1 && tallAtRight) {
        smartHinge = 'left';
      }

      if (hitsWindow(x, x + w, 0, BASE_H + COUNTERTOP_H)) {
        notes.push(`Окно ниже столешницы (${BASE_H + COUNTERTOP_H} мм): проверьте подоконник на участке ${x}-${x + w} мм.`);
      }

      modules.push({
        ...common, id: uid(), name: baseName, kind: 'base', x, w, h: BASE_H, d: 560, plinth: 100, lift: 0,
        sections: baseSections, doorMode: baseDoorMode, hinge: smartHinge, drawerH: baseDrH, handles: true, countertop: true,
        milling: bottomMilling, plinthColor,
      });

      if (wallsOk) {
        if (hitsWindow(x, x + w, WALL_LIFT, WALL_LIFT + upperH)) {
          notes.push(`Верхний шкаф ${x}-${x + w} мм пропущен: окно.`);
        } else {
          modules.push({
            id: uid(), name: upperName, kind: 'wall', x, w, h: upperH, d: 320, plinth: 0, lift: WALL_LIFT,
            sections: [sec({ shelves: 2, door: true })], doorMode: 'hinged', hinge: smartHinge, handles: true, countertop: false,
            milling: upperMilling, ...common,
          });
        }
      }

      if (useMezz) {
        if (hitsWindow(x, x + w, mezzLift, topY)) {
          notes.push(`Антресоль ${x}-${x + w} мм пропущена: окно.`);
        } else {
          modules.push({
            id: uid(), name: `Антресоль ${slot + 1} (газлифт вверх)`,
            kind: 'wall', x, w, h: mezzH, d: 560, plinth: 0,
            lift: mezzLift, sections: [sec({ shelves: 0, door: true })], doorMode: 'hinged', hinge: 'top', handles: false,
            countertop: false, milling: mezzMilling, ...common,
          });
        }
      }

      x += w;
      slot++;
    }
  }

  if (opts.topTrimH && opts.topTrimH > 0) {
    const trimH = Math.min(250, Math.round(opts.topTrimH));
    for (const m of modules) {
      if (m.kind === 'base' || m.kind === 'corner') continue;
      if (useMezz && (m.kind === 'wall' || m.kind === 'cornerWall') && m.lift < mezzLift) continue;
      m.topTrim = trimH;
    }
  }

  return { modules, notes };
}

export function generateKitchenLayout(opts: KitchenWizardOptions, room?: RoomConfig): Module[] {
  return planKitchen(opts, room).modules;
}
