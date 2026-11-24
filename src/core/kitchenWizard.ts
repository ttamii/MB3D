import type { RoomConfig } from './room';
import type { Module, Section } from './types';
import { uid } from './util';

export interface KitchenWizardOptions {
  wallLength: number; // длина основной (задней) стены, мм
  leftLength?: number; // длина левого крыла (для Г-левой и П-образной кухни), мм
  rightLength?: number; // длина правого крыла (для Г-правой и П-образной кухни), мм
  tiers: 2 | 3; // 2 яруса (низ + верх) или 3 яруса (низ + верх + антресоли)
  facadeMat: string;
  corpusMat: string;
  topMat: string;
  plinthColor: 'facade' | 'corpus';
  millingMix: 'trend' | 'modern' | 'frame' | 'ribbed';
  layoutVariant: number; // 0: пенал в начале/крыле, 1: пенал справа, 2: без пенала
  shape?: 'linear' | 'corner-left' | 'corner-right' | 'u-shape';
  cornerType?: 'blind' | 'l-shape' | 'diagonal';
  baseDepth?: number; // глубина нижних модулей (560 стандарт или 500 компакт)
  mezzDepthMode?: 'flush' | 'deep'; // антресоли вровень с верхними (320) или глубокие (baseDepth)
  topTrimH?: number; // карниз под потолок (0 = нет, например 60 мм)
}

export interface KitchenPlan {
  modules: Module[];
  notes: string[];
}

const BASE_H = 820;
const WALL_LIFT = 1450;
const WALL_H = 720;
const UPPER_D = 320;
const TALL_W = 600;
const MIN_W = 300;
const DOOR_GAP = 50;

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return { shelves: 0, drawers: 0, rod: rods > 0, rods, door: true, ...p };
};

interface Seg { x0: number; x1: number }

/** Свободные участки на указанной стене с учётом дверных проёмов. */
function freeWallSegments(
  wall: 'back' | 'left' | 'right',
  startX: number,
  endX: number,
  room: RoomConfig | undefined,
  notes: string[],
  hasLeftCorner: boolean,
  hasRightCorner: boolean,
): Seg[] {
  const maxRoomSpan = room ? (wall === 'back' ? room.w : room.d) : endX;
  let x0 = Math.max(0, startX);
  let x1 = Math.min(endX, maxRoomSpan);
  if (endX > maxRoomSpan) {
    notes.push(`Длина ряда ${endX} мм превышает размер стены (${maxRoomSpan} мм), использовано ${maxRoomSpan} мм.`);
  }
  if (!room) return x1 - x0 >= MIN_W ? [{ x0, x1 }] : [];

  if (wall === 'back') {
    for (const d of room.doors) {
      if (d.wall === 'back' || d.x >= 620) continue;
      const clear = d.w + 20;
      if (d.wall === 'left' && !hasLeftCorner) x0 = Math.max(x0, clear);
      else if (d.wall === 'right' && !hasRightCorner) x1 = Math.min(x1, room.w - clear);
    }
  }

  let segs: Seg[] = x1 - x0 >= MIN_W ? [{ x0, x1 }] : [];
  for (const d of room.doors.filter((q) => q.wall === wall)) {
    const a = d.x - DOOR_GAP;
    const b = d.x + d.w + DOOR_GAP;
    segs = segs.flatMap((s) => {
      if (b <= s.x0 || a >= s.x1) return [s];
      const out: Seg[] = [];
      if (a - s.x0 >= MIN_W) out.push({ x0: s.x0, x1: a });
      if (s.x1 - b >= MIN_W) out.push({ x0: b, x1: s.x1 });
      return out;
    });
    const wallLbl = wall === 'back' ? 'задней' : wall === 'left' ? 'левой' : 'правой';
    notes.push(`Дверной проём на ${wallLbl} стене (${Math.round(d.x)}–${Math.round(d.x + d.w)} мм) обойдён.`);
  }
  return segs.filter((s) => s.x1 - s.x0 >= MIN_W);
}

/** Делит участок на стандартные кухонные модули без остатка. */
function splitWidths(len: number, minCount = 1, preferSinkFirst = true): number[] {
  if (len < 720 && minCount <= 1) return [len];
  const lo = Math.max(minCount, Math.ceil(len / 850));
  const hi = Math.max(lo, Math.floor(len / 350));
  const n = Math.min(hi, Math.max(lo, Math.round(len / 620)));
  if (n <= 1) return [len];

  const widths = Array.from({ length: n }, (_, i) => {
    if (preferSinkFirst && i === 0 && len >= n * 520 + 180) return 800;
    if (i === n - 1 && n >= 4 && len >= 2900) return 800;
    return 600;
  });

  let diff = len - widths.reduce((a, b) => a + b, 0);
  const flexOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const prio = (idx: number) => (idx === 2 ? 10 : (preferSinkFirst && idx === 0) ? 8 : idx === n - 1 ? 5 : 1);
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
  if (diff !== 0) widths[widths.length - 1] += diff;
  return widths;
}

export function planKitchen(opts: KitchenWizardOptions, room?: RoomConfig): KitchenPlan {
  const { tiers, facadeMat, corpusMat, topMat, plinthColor, millingMix, layoutVariant } = opts;
  const shape = opts.shape ?? 'linear';
  const cornerType = opts.cornerType ?? 'blind';
  const baseD = opts.baseDepth ?? 560;
  const hasLeft = shape === 'corner-left' || shape === 'u-shape';
  const hasRight = shape === 'corner-right' || shape === 'u-shape';
  const isAnyCorner = hasLeft || hasRight;
  const mezzD = (opts.mezzDepthMode ?? (isAnyCorner ? 'flush' : 'deep')) === 'flush' ? UPPER_D : baseD;

  const notes: string[] = [];
  const modules: Module[] = [];

  const totalBack = Math.max(1600, opts.wallLength);
  const totalLeft = Math.max(1200, opts.leftLength ?? Math.min(room?.d ?? 2400, 2100));
  const totalRight = Math.max(1200, opts.rightLength ?? Math.min(room?.d ?? 2400, 2100));
  const effectiveBackLen = hasRight && room ? room.w : totalBack;

  const hitsWindowOn = (wall: 'back' | 'left' | 'right', x0: number, x1: number, y0: number, y1: number): boolean =>
    (room?.windows ?? [])
      .filter((w) => w.wall === wall)
      .some((w) => x0 < w.x + w.w && x1 > w.x && y0 < w.lift + w.h && y1 > w.lift);

  const ceiling = room?.h ?? 2530;
  const topY = Math.min(ceiling, 2560);
  const upperH = Math.min(WALL_H, ceiling - WALL_LIFT);
  const mezzLift = WALL_LIFT + WALL_H;
  const mezzH = topY - mezzLift;
  const useMezz = tiers === 3 && mezzH >= 200;
  if (tiers === 3 && !useMezz) notes.push(`Потолок ${ceiling} мм: антресоли не помещаются, оставлено 2 яруса.`);
  const tallH = useMezz ? topY : Math.min(2170, ceiling - 30);
  const wallsOk = upperH >= 400;

  const bottomMilling = millingMix === 'trend' ? 'frame' : millingMix;
  const upperMilling = millingMix === 'trend' ? 'modern' : millingMix;
  const mezzMilling = millingMix === 'trend' ? 'ribbed' : millingMix;

  const common = {
    mirror: false,
    t: 16,
    slidingCount: 2,
    drawerH: 200,
    matCorpus: corpusMat,
    matFacade: facadeMat,
    matBack: 'b-white',
    matTop: topMat,
  };

  let backStartBase = 0;
  let backEndBase = effectiveBackLen;
  let backStartUpper = 0;
  let backEndUpper = effectiveBackLen;

  let leftStartBase = 0;
  let leftStartUpper = 0;
  let rightStartBase = 0;
  let rightStartUpper = 0;

  let sinkPlacedInCorner = false;
  const fillerBaseW = 45;
  const fillerUpperW = 40;

  // ——— 1. УГЛОВЫЕ УЗЛЫ (ЛЕВЫЙ И/ИЛИ ПРАВЫЙ УГОЛ) ———
  const buildCornerNode = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    if (cornerType === 'blind') {
      // Прямой приставной угловой модуль с глухой зоной и L-блендой 90°
      const blindBaseW = baseD + fillerBaseW; // например 560 + 45 = 605 мм
      const modBaseW = blindBaseW + 495;      // 1100 мм (дверь ~495 мм)
      const bx = isRight ? effectiveBackLen - modBaseW : 0;
      const isSinkCorner = !sinkPlacedInCorner;
      if (isSinkCorner) sinkPlacedInCorner = true;

      modules.push({
        ...common,
        id: uid(),
        name: isSinkCorner ? 'Модуль под мойку (угловой прямой)' : 'Угловой нижний (прямой)',
        kind: 'base',
        x: bx,
        w: modBaseW,
        h: BASE_H,
        d: baseD,
        plinth: 100,
        lift: 0,
        blindSide: isRight ? 'right' : 'left',
        blindW: blindBaseW,
        blindFillerW: fillerBaseW,
        doorCount: 1,
        hinge: isRight ? 'left' : 'right',
        sections: [sec({ shelves: isSinkCorner ? 0 : 1, door: true })],
        doorMode: 'hinged',
        handles: true,
        countertop: true,
        milling: bottomMilling,
        plinthColor,
      });

      const blindUpW = UPPER_D + fillerUpperW; // 320 + 40 = 360 мм
      const modUpW = blindUpW + 590;           // 950 мм (дверь ~590 мм)
      const ux = isRight ? effectiveBackLen - modUpW : 0;

      if (wallsOk && !hitsWindowOn('back', ux, ux + modUpW, WALL_LIFT, WALL_LIFT + upperH)) {
        modules.push({
          ...common,
          id: uid(),
          name: isSinkCorner ? 'Угловой шкаф-сушка (прямой)' : 'Угловой верхний (прямой)',
          kind: 'wall',
          x: ux,
          w: modUpW,
          h: upperH,
          d: UPPER_D,
          plinth: 0,
          lift: WALL_LIFT,
          blindSide: isRight ? 'right' : 'left',
          blindW: blindUpW,
          blindFillerW: fillerUpperW,
          doorCount: 1,
          hinge: isRight ? 'left' : 'right',
          sections: [sec({ shelves: 2, door: true })],
          doorMode: 'hinged',
          handles: true,
          countertop: false,
          milling: upperMilling,
        });
      }

      if (useMezz && !hitsWindowOn('back', ux, ux + modUpW, mezzLift, topY)) {
        const blindMezzW = mezzD + fillerUpperW;
        modules.push({
          ...common,
          id: uid(),
          name: 'Антресоль угловая (газлифт)',
          kind: 'wall',
          x: ux,
          w: modUpW,
          h: mezzH,
          d: mezzD,
          plinth: 0,
          lift: mezzLift,
          blindSide: isRight ? 'right' : 'left',
          blindW: blindMezzW,
          blindFillerW: fillerUpperW,
          hinge: 'top',
          handles: false,
          countertop: false,
          milling: mezzMilling,
          sections: [sec({ shelves: 0, door: true })],
          doorMode: 'hinged',
        });
      }

      if (isRight) {
        backEndBase -= modBaseW;
        backEndUpper -= modUpW;
        rightStartBase = baseD + fillerBaseW;
        rightStartUpper = UPPER_D + fillerUpperW;
      } else {
        backStartBase += modBaseW;
        backStartUpper += modUpW;
        leftStartBase = baseD + fillerBaseW;
        leftStartUpper = UPPER_D + fillerUpperW;
      }
    } else {
      // Г-образный 90° (900×900) или Трапеция 45° (900×900)
      const cMode = cornerType === 'diagonal' ? 'diagonal' : 'l-shape';
      const cBaseW = 900;
      const cUpperW = 600;
      const bx = isRight ? effectiveBackLen - cBaseW : 0;
      const ux = isRight ? effectiveBackLen - cUpperW : 0;
      const isSinkCorner = cMode === 'diagonal' && !sinkPlacedInCorner;
      if (isSinkCorner) sinkPlacedInCorner = true;

      modules.push({
        ...common,
        id: uid(),
        mirror: isRight,
        name: cMode === 'diagonal' ? 'Угловой трапеция 45° (900×900)' : 'Угловой Г-образный 90° (900×900)',
        kind: 'corner',
        cornerMode: cMode,
        cornerW2: cBaseW,
        ...(isSinkCorner ? { cornerSink: true } : {}),
        x: bx,
        w: cBaseW,
        h: BASE_H,
        d: baseD,
        plinth: 100,
        lift: 0,
        sections: [sec({ shelves: isSinkCorner ? 0 : 1, door: true })],
        doorMode: 'hinged',
        handles: true,
        countertop: true,
        milling: bottomMilling,
        plinthColor,
      });

      if (wallsOk && !hitsWindowOn('back', ux, ux + cUpperW, WALL_LIFT, WALL_LIFT + upperH)) {
        modules.push({
          ...common,
          id: uid(),
          mirror: isRight,
          name: cMode === 'diagonal' ? 'Угловой верхний 45° (600×600)' : 'Угловой верхний 90° (600×600)',
          kind: 'cornerWall',
          cornerMode: cMode,
          cornerW2: cUpperW,
          x: ux,
          w: cUpperW,
          h: upperH,
          d: UPPER_D,
          plinth: 0,
          lift: WALL_LIFT,
          sections: [sec({ shelves: 2, door: true })],
          doorMode: 'hinged',
          handles: true,
          countertop: false,
          milling: upperMilling,
        });
      }

      if (useMezz && !hitsWindowOn('back', ux, ux + cUpperW, mezzLift, topY)) {
        const cMezzW = mezzD > 380 ? cBaseW : cUpperW;
        const mzX = isRight ? effectiveBackLen - cMezzW : 0;
        modules.push({
          ...common,
          id: uid(),
          mirror: isRight,
          name: 'Антресоль угловая',
          kind: 'cornerWall',
          cornerMode: cMode,
          cornerW2: cMezzW,
          x: mzX,
          w: cMezzW,
          h: mezzH,
          d: mezzD,
          plinth: 0,
          lift: mezzLift,
          sections: [sec({ shelves: 0, door: true })],
          doorMode: 'hinged',
          handles: false,
          countertop: false,
          milling: mezzMilling,
        });
      }

      if (isRight) {
        backEndBase -= cBaseW;
        backEndUpper -= cUpperW;
        rightStartBase = cBaseW;
        rightStartUpper = cUpperW;
      } else {
        backStartBase += cBaseW;
        backStartUpper += cUpperW;
        leftStartBase = cBaseW;
        leftStartUpper = cUpperW;
      }
    }
  };

  if (hasLeft && effectiveBackLen >= 1500) buildCornerNode('left');
  if (hasRight && effectiveBackLen - backStartBase >= 1400) buildCornerNode('right');

  // ——— 2. РАЗМЕЩЕНИЕ ПЕНАЛА ПОД ДУХОВКУ/СВЧ ———
  let tallPlaced = layoutVariant === 2;

  // В Г-образной или П-образной кухне вариант 0 ставит пенал в торец бокового крыла (если крыло вмещает), а вариант 1 — на основной стене
  let leftEndLimit = totalLeft;
  let rightEndLimit = totalRight;

  if (!tallPlaced && hasLeft && layoutVariant === 0 && totalLeft - leftStartBase >= 950) {
    const tx = totalLeft - TALL_W;
    if (!hitsWindowOn('left', tx, tx + TALL_W, 0, tallH)) {
      modules.push({
        ...common,
        id: uid(),
        wall: 'left',
        name: 'Пенал с нишей под духовку и СВЧ',
        kind: 'tall',
        x: tx,
        w: TALL_W,
        h: tallH,
        d: baseD,
        plinth: 100,
        lift: 0,
        drawerH: 360,
        ovenH: 600,
        mwH: 380,
        hinge: 'left',
        sections: [sec({ drawers: 1, shelves: 2, door: true })],
        doorMode: 'hinged',
        handles: true,
        countertop: false,
        milling: bottomMilling,
        plinthColor,
      });
      leftEndLimit -= TALL_W;
      tallPlaced = true;
    }
  } else if (!tallPlaced && hasRight && layoutVariant === 0 && totalRight - rightStartBase >= 950) {
    const tx = totalRight - TALL_W;
    if (!hitsWindowOn('right', tx, tx + TALL_W, 0, tallH)) {
      modules.push({
        ...common,
        id: uid(),
        wall: 'right',
        name: 'Пенал с нишей под духовку и СВЧ',
        kind: 'tall',
        x: tx,
        w: TALL_W,
        h: tallH,
        d: baseD,
        plinth: 100,
        lift: 0,
        drawerH: 360,
        ovenH: 600,
        mwH: 380,
        hinge: 'right',
        sections: [sec({ drawers: 1, shelves: 2, door: true })],
        doorMode: 'hinged',
        handles: true,
        countertop: false,
        milling: bottomMilling,
        plinthColor,
      });
      rightEndLimit -= TALL_W;
      tallPlaced = true;
    }
  }

  // Если пенал ещё не размещён — размещаем его на свободной оконечности основной (задней) стены
  if (!tallPlaced && backEndBase - backStartBase >= 1200) {
    const canLeft = !hasLeft && layoutVariant === 0;
    const canRight = !hasRight;
    if (canLeft || canRight) {
      const atLeft = canLeft;
      const tx = atLeft ? backStartBase : backEndBase - TALL_W;
      if (!hitsWindowOn('back', tx, tx + TALL_W, 0, tallH)) {
        modules.push({
          ...common,
          id: uid(),
          name: 'Пенал с нишей под духовку и СВЧ',
          kind: 'tall',
          x: tx,
          w: TALL_W,
          h: tallH,
          d: baseD,
          plinth: 100,
          lift: 0,
          drawerH: 360,
          ovenH: 600,
          mwH: 380,
          hinge: atLeft ? 'right' : 'left',
          sections: [sec({ drawers: 1, shelves: 2, door: true })],
          doorMode: 'hinged',
          handles: true,
          countertop: false,
          milling: bottomMilling,
          plinthColor,
        });
        if (atLeft) {
          backStartBase += TALL_W;
          backStartUpper = Math.max(backStartUpper, backStartBase);
        } else {
          backEndBase -= TALL_W;
          backEndUpper = Math.min(backEndUpper, backEndBase);
        }
        tallPlaced = true;
      }
    }
  }

  // ——— 3. ЗАПОЛНЕНИЕ ОСНОВНОЙ СТЕНЫ ('back') ———
  const backSegs = freeWallSegments('back', backStartBase, backEndBase, room, notes, hasLeft, hasRight);
  let hobPlaced = false;
  let slot = 0;

  // Доборный верхний шкафчик 300 мм над разницей Г-угла 900 (низ) vs 600 (верх)
  if (hasLeft && cornerType !== 'blind' && backStartBase > backStartUpper) {
    const gapW = backStartBase - backStartUpper;
    if (gapW >= 200 && wallsOk && !hitsWindowOn('back', backStartUpper, backStartBase, WALL_LIFT, WALL_LIFT + upperH)) {
      modules.push({
        ...common,
        id: uid(),
        name: `Верхний шкаф ${gapW} мм`,
        kind: 'wall',
        x: backStartUpper,
        w: gapW,
        h: upperH,
        d: UPPER_D,
        plinth: 0,
        lift: WALL_LIFT,
        hinge: 'right',
        handles: true,
        countertop: false,
        milling: upperMilling,
        sections: [sec({ shelves: 2, door: true })],
        doorMode: 'hinged',
      });
      if (useMezz && mezzD <= 380 && !hitsWindowOn('back', backStartUpper, backStartBase, mezzLift, topY)) {
        modules.push({
          ...common,
          id: uid(),
          name: `Антресоль ${gapW} мм`,
          kind: 'wall',
          x: backStartUpper,
          w: gapW,
          h: mezzH,
          d: mezzD,
          plinth: 0,
          lift: mezzLift,
          hinge: 'top',
          handles: false,
          countertop: false,
          milling: mezzMilling,
          sections: [sec({ shelves: 0, door: true })],
          doorMode: 'hinged',
        });
      }
    }
  }
  if (hasRight && cornerType !== 'blind' && backEndUpper > backEndBase) {
    const gapW = backEndUpper - backEndBase;
    if (gapW >= 200 && wallsOk && !hitsWindowOn('back', backEndBase, backEndUpper, WALL_LIFT, WALL_LIFT + upperH)) {
      modules.push({
        ...common,
        id: uid(),
        name: `Верхний шкаф ${gapW} мм`,
        kind: 'wall',
        x: backEndBase,
        w: gapW,
        h: upperH,
        d: UPPER_D,
        plinth: 0,
        lift: WALL_LIFT,
        hinge: 'left',
        handles: true,
        countertop: false,
        milling: upperMilling,
        sections: [sec({ shelves: 2, door: true })],
        doorMode: 'hinged',
      });
      if (useMezz && mezzD <= 380 && !hitsWindowOn('back', backEndBase, backEndUpper, mezzLift, topY)) {
        modules.push({
          ...common,
          id: uid(),
          name: `Антресоль ${gapW} мм`,
          kind: 'wall',
          x: backEndBase,
          w: gapW,
          h: mezzH,
          d: mezzD,
          plinth: 0,
          lift: mezzLift,
          hinge: 'top',
          handles: false,
          countertop: false,
          milling: mezzMilling,
          sections: [sec({ shelves: 0, door: true })],
          doorMode: 'hinged',
        });
      }
    }
  }

  for (const s of backSegs) {
    const len = s.x1 - s.x0;
    if (len < MIN_W) continue;
    let x = s.x0;
    const widths = splitWidths(len, 1, !sinkPlacedInCorner);
    for (let wi = 0; wi < widths.length; wi++) {
      const w = widths[wi];
      let baseName = w >= 700 ? `Двухдверная тумба` : `Нижний модуль`;
      let baseSections = [sec({ shelves: 1, door: true })];
      let baseDoorMode: 'none' | 'hinged' = 'hinged';
      let baseDrH = 200;
      let upperName = w >= 700 ? `Двухдверный шкаф для посуды` : `Верхний шкаф`;

      if (!sinkPlacedInCorner && slot === 0) {
        baseName = w >= 700 ? 'Модуль под мойку (2 двери)' : 'Модуль под мойку';
        baseSections = [sec({ shelves: 0, door: true })];
        upperName = 'Шкаф-сушка для посуды (2 яруса)';
        sinkPlacedInCorner = true;
      } else if (!hobPlaced && ((sinkPlacedInCorner && slot >= 1) || slot >= 2) && w >= 500) {
        baseName = tallPlaced ? 'Модуль под варочную (2 ящика)' : 'Модуль под варочную и духовку';
        baseSections = tallPlaced ? [sec({ drawers: 2, door: false })] : [sec({ shelves: 1, drawers: 1, door: false })];
        baseDoorMode = 'none';
        baseDrH = tallPlaced ? 355 : 160;
        upperName = 'Шкаф под встроенную вытяжку';
        hobPlaced = true;
      } else if (slot === 0 || slot === 1) {
        baseName = 'Модуль с 3 ящиками (приборы + кастрюли)';
        baseSections = [sec({ drawers: 3, door: false })];
        baseDoorMode = 'none';
        baseDrH = 240;
        upperName = 'Шкаф для посуды и бокалов';
      }

      const smartHinge: 'left' | 'right' = wi === 0 ? 'right' : wi === widths.length - 1 ? 'left' : (slot % 2 === 0 ? 'left' : 'right');

      modules.push({
        ...common,
        id: uid(),
        name: baseName,
        kind: 'base',
        x,
        w,
        h: BASE_H,
        d: baseD,
        plinth: 100,
        lift: 0,
        sections: baseSections,
        doorMode: baseDoorMode,
        hinge: smartHinge,
        drawerH: baseDrH,
        handles: true,
        countertop: true,
        milling: bottomMilling,
        plinthColor,
      });

      if (wallsOk && !hitsWindowOn('back', x, x + w, WALL_LIFT, WALL_LIFT + upperH)) {
        modules.push({
          ...common,
          id: uid(),
          name: upperName,
          kind: 'wall',
          x,
          w,
          h: upperH,
          d: UPPER_D,
          plinth: 0,
          lift: WALL_LIFT,
          sections: [sec({ shelves: 2, door: true })],
          doorMode: 'hinged',
          hinge: smartHinge,
          handles: true,
          countertop: false,
          milling: upperMilling,
        });
      }

      if (useMezz && !hitsWindowOn('back', x, x + w, mezzLift, topY)) {
        modules.push({
          ...common,
          id: uid(),
          name: `Антресоль (газлифт)`,
          kind: 'wall',
          x,
          w,
          h: mezzH,
          d: mezzD,
          plinth: 0,
          lift: mezzLift,
          sections: [sec({ shelves: 0, door: true })],
          doorMode: 'hinged',
          hinge: 'top',
          handles: false,
          countertop: false,
          milling: mezzMilling,
        });
      }

      x += w;
      slot++;
    }
  }

  // ——— 4. ЗАПОЛНЕНИЕ БОКОВЫХ КРЫЛЬЕВ ('left' И 'right') ———
  const populateSideWing = (side: 'left' | 'right', startBase: number, startUp: number, endLim: number) => {
    const baseSegs = freeWallSegments(side, startBase, endLim, room, notes, true, true);
    const wingTag = side === 'left' ? 'левое крыло' : 'правое крыло';

    for (const seg of baseSegs) {
      const len = seg.x1 - seg.x0;
      if (len < 250) continue;
      let sx = seg.x0;
      const widths = splitWidths(len, 1, false);
      widths.forEach((w, idx) => {
        const useDrawers = idx === 0 && w >= 450 && w <= 800;
        modules.push({
          ...common,
          id: uid(),
          wall: side,
          name: useDrawers ? `Модуль с ящиками (${wingTag})` : `Нижний шкаф (${wingTag})`,
          kind: 'base',
          x: sx,
          w,
          h: BASE_H,
          d: baseD,
          plinth: 100,
          lift: 0,
          sections: useDrawers ? [sec({ drawers: 3, door: false })] : [sec({ shelves: 1, door: true })],
          doorMode: useDrawers ? 'none' : 'hinged',
          drawerH: 240,
          hinge: side === 'left' ? 'left' : 'right',
          handles: true,
          countertop: true,
          milling: bottomMilling,
          plinthColor,
        });
        sx += w;
      });
    }

    // Верхние шкафы и антресоли на боковом крыле (от точной границы верхнего угла startUp до endLim!)
    const upSegs = freeWallSegments(side, startUp, endLim, room, notes, true, true);
    for (const seg of upSegs) {
      const len = seg.x1 - seg.x0;
      if (len < 250) continue;
      let ux = seg.x0;
      const uWidths = splitWidths(len, 1, false);
      uWidths.forEach((w) => {
        if (wallsOk && !hitsWindowOn(side, ux, ux + w, WALL_LIFT, WALL_LIFT + upperH)) {
          modules.push({
            ...common,
            id: uid(),
            wall: side,
            name: `Верхний шкаф (${wingTag})`,
            kind: 'wall',
            x: ux,
            w,
            h: upperH,
            d: UPPER_D,
            plinth: 0,
            lift: WALL_LIFT,
            sections: [sec({ shelves: 2, door: true })],
            doorMode: 'hinged',
            hinge: side === 'left' ? 'left' : 'right',
            handles: true,
            countertop: false,
            milling: upperMilling,
          });
        }
        if (useMezz && !hitsWindowOn(side, ux, ux + w, mezzLift, topY)) {
          modules.push({
            ...common,
            id: uid(),
            wall: side,
            name: `Антресоль (${wingTag})`,
            kind: 'wall',
            x: ux,
            w,
            h: mezzH,
            d: mezzD,
            plinth: 0,
            lift: mezzLift,
            sections: [sec({ shelves: 0, door: true })],
            doorMode: 'hinged',
            hinge: 'top',
            handles: false,
            countertop: false,
            milling: mezzMilling,
          });
        }
        ux += w;
      });
    }
  };

  if (hasLeft) populateSideWing('left', leftStartBase, leftStartUpper, leftEndLimit);
  if (hasRight) populateSideWing('right', rightStartBase, rightStartUpper, rightEndLimit);

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
