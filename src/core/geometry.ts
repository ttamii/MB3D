import { BACK_T, COUNTERTOP_T, FACADE_T, isCorner, isWall } from './defaults';
import type { BuiltModule, Module, Part, PartAnim, PartMat } from './types';

type V3 = [number, number, number];

class Builder {
  parts: Part[] = [];
  hw: Record<string, number> = {};

  add(k: string, n = 1): void {
    if (n > 0) this.hw[k] = (this.hw[k] ?? 0) + n;
  }

  box(
    name: string, mat: PartMat, pos: V3, size: V3, edgeMm = 0, anim?: PartAnim, sheet = true, rotY?: number,
  ): void {
    this.parts.push({
      name, mat, pos: [...pos], size: [...size], edgeMm, sheet, shape: 'box',
      ...(rotY !== undefined ? { rotY } : {}),
      ...(anim ? { anim } : {}),
    });
  }

  decor(name: string, mat: PartMat, pos: V3, size: V3, anim?: PartAnim, shape: 'box' | 'cyl' = 'box', rotY?: number): void {
    this.parts.push({
      name, mat, pos: [...pos], size: [...size], edgeMm: 0, sheet: false, shape,
      ...(rotY !== undefined ? { rotY } : {}),
      ...(anim ? { anim } : {}),
    });
  }
}

export const hingesFor = (h: number) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5);

function resolveHandleMat(m: Module): PartMat {
  if (m.handleColor === 'gold' || m.matFacade === 'vitrine-bronze-gold') return 'handle-gold';
  if (m.handleColor === 'black' || m.matFacade === 'vitrine-graphite-black') return 'handle-black';
  return 'handle';
}

function isVitrineFacade(m: Module): 'gold' | 'black' | null {
  if (m.matFacade === 'vitrine-bronze-gold') return 'gold';
  if (m.matFacade === 'vitrine-graphite-black' || m.matFacade === 'm-glass-fl') return 'black';
  return null;
}

/** Ручка на фасаде двери: сбоку вертикально, сверху горизонтально (в одну линию с ящиками!) или торцевая сверху. */
function doorHandle(
  b: Builder, m: Module, anim: PartAnim, x0: number, x1: number, y0: number, y1: number,
  hinge: 'left' | 'right' | 'top', zFront: number,
): void {
  if (!m.handles) return;
  const hMat = resolveHandleMat(m);
  const dw = x1 - x0;
  const dh = y1 - y0;

  if (hinge === 'top') {
    const hw = Math.max(90, Math.min(240, dw * 0.35));
    b.decor('Ручка', hMat, [(x0 + x1 - hw) / 2, y0 + 24, zFront], [hw, 14, 22], anim);
    b.add('handle');
    return;
  }

  const isUpperDoor = isWall(m.kind) || y0 >= 1100;

  // Торцевая накладная ручка-профиль по торцу фасада
  if (m.handlePos === 'edge-top') {
    const hw = Math.max(100, Math.min(260, dw * 0.45));
    const hy = isUpperDoor ? y0 : (y1 > 1400 ? Math.min(y1 - 4, 1050) : y1 - 4);
    b.decor('Ручка торцевая', hMat, [(x0 + x1 - hw) / 2, hy, zFront - FACADE_T], [hw, 4, FACADE_T + 18], anim);
    b.add('handle');
    return;
  }

  // Горизонтальная ручка по центру фасада (на тумбах строго на y1 - 38 в линию с ящиками, на верхних створках — снизу у руки!)
  if (m.handlePos === 'top-horiz') {
    const hw = Math.min(220, Math.max(96, dw * 0.5));
    const hy = isUpperDoor ? y0 + 24 : (y1 > 1400 ? Math.max(y0 + 24, Math.min(y1 - 38, 1000)) : y1 - 38);
    b.decor('Ручка', hMat, [(x0 + x1 - hw) / 2, hy, zFront], [hw, 14, 22], anim);
    b.add('handle');
    return;
  }

  // Классическая вертикальная ручка со стороны открывания
  const hl = Math.max(100, Math.min(320, dh * 0.25));
  const hx = hinge === 'left' ? x1 - 38 : x0 + 24;
  let y: number;
  if (isWall(m.kind)) y = y0 + 30;
  else if (m.kind === 'base' || m.kind === 'corner') y = y1 - 30 - hl;
  else y = Math.max(y0 + 20, Math.min(y1 - hl - 20, 1000 - hl / 2));
  b.decor('Ручка', hMat, [hx, y, zFront], [14, hl, 22], anim);
  b.add('handle');
}

export function isDoubleDoorSection(m: Module, segW: number): boolean {
  if (m.hinge === 'top') return false;
  if (m.doorCount === 1) return false;
  if (m.doorCount === 2) return true;
  if (segW > 620) return true;
  if (segW >= 540 && /сушк|двухдвер|посуд|2\s*ств|2\s*двер/i.test(m.name)) return true;
  return false;
}

export interface TallOvenZones {
  isTallOven: boolean;
  yHor1: number;
  yOv0: number;
  yOv1: number;
  ovenH: number;
  hasOven: boolean;
  yMw0: number;
  yMw1: number;
  mwH: number;
  hasMw: boolean;
  upperZoneBottom: number;
}

/** Рассчитывает точные высотные отметки зон пенала под духовку и СВЧ (единый источник для 3D, присадки и чертежей). */
export function getTallOvenZones(m: Module): TallOvenZones {
  const isTallOven = m.kind === 'tall' && /духов|свч/i.test(m.name);
  const t = m.t || 16;
  const P = isWall(m.kind) ? 0 : m.plinth;
  const zTop = m.h - t;
  const nd = m.sections[0]?.drawers ?? 0;
  const fhStep = nd > 0 ? Math.min(m.drawerH || 360, (m.h - P - 4) / nd) : 0;
  const yHor1 = nd > 0 ? P + Math.round(nd * fhStep) : P + 450;
  const ovenH = m.ovenH ?? 600;
  const yOv0 = yHor1 + t;
  const yOv1 = yOv0 + ovenH;
  const hasOven = isTallOven && yOv1 + t < zTop - 160;
  const mwH = m.mwH ?? (/свч/i.test(m.name) ? 380 : 0);
  const yMw0 = yOv1 + t;
  const yMw1 = yMw0 + mwH;
  const hasMw = hasOven && mwH > 0 && yMw1 + t < zTop - 160;
  const upperZoneBottom = hasMw ? yMw1 + t : hasOven ? yOv1 + t : (nd > 0 ? yHor1 : P + t);
  return { isTallOven, yHor1, yOv0, yOv1, ovenH, hasOven, yMw0, yMw1, mwH, hasMw, upperZoneBottom };
}

function frontDoor(
  b: Builder, m: Module, label: string, x0: number, x1: number, y0: number, y1: number,
  hinge: 'left' | 'right' | 'top', D: number, key: string,
): void {
  const isFlap = hinge === 'top';
  // Ограничитель угла открывания 85° (Blum Clip Top 86° / Aventos), чтобы створки не бились о соседние модули, пеналы и стены
  const ang = isFlap ? -85 : (hinge === 'left' ? -85 : 85);
  const anim: PartAnim = isFlap
    ? { type: 'flap', key, pivot: [x0, D], pivotY: y1, ang }
    : { type: 'door', key, pivot: [hinge === 'left' ? x0 : x1, D], ang };
  const dw = x1 - x0;
  const dh = y1 - y0;
  const milling = m.milling ?? 'modern';
  const vitrineFrame = isVitrineFacade(m);

  if (vitrineFrame && dw > 90 && dh > 120) {
    // Витринный фасад: тонкий анодированный алюминиевый профиль (Золото / Чёрный) + полупрозрачное тонированное стекло Бронза / Графит
    const profW = 22;
    const frameMat: PartMat = vitrineFrame === 'gold' ? 'gold' : 'black';
    const glassMat: PartMat = vitrineFrame === 'gold' ? 'glass-bronze' : 'glass-graphite';
    // Рамка профиля по периметру (учитывается по площади фасада в смете + декоративный 3D-профиль)
    b.box(label, 'facade', [x0, y1 - profW, D], [dw, profW, FACADE_T], 0, anim, false);
    b.decor(`${label}: профиль верх`, frameMat, [x0, y1 - profW, D], [dw, profW, FACADE_T], anim);
    b.decor(`${label}: профиль низ`, frameMat, [x0, y0, D], [dw, profW, FACADE_T], anim);
    b.decor(`${label}: профиль лево`, frameMat, [x0, y0 + profW, D], [profW, dh - 2 * profW, FACADE_T], anim);
    b.decor(`${label}: профиль право`, frameMat, [x1 - profW, y0 + profW, D], [profW, dh - 2 * profW, FACADE_T], anim);
    // Стеклянная вставка 4 мм внутри профиля (участвует в стоимости витрины по м²)
    b.box(`${label}: стекло витрины`, glassMat, [x0 + profW - 2, y0 + profW - 2, D + 6], [dw - 2 * profW + 4, dh - 2 * profW + 4, 4], 0, anim, false);
    // Учёт квадратуры витринного фасада в смете (скрытая расчётная строка без непрозрачной геометрии в 3D)
    b.parts.push({ name: `${label} (витрина в профиле)`, mat: 'facade', pos: [x0, y0, D], size: [0.01, dh, dw], edgeMm: 0, sheet: true, shape: 'box' });
  } else if (milling === 'frame') {
    // Рамочный фасад (классика / shaker): основа + декоративная рамка 50 мм толщиной 3 мм
    b.box(label, 'facade', [x0, y0, D], [dw, dh, FACADE_T - 3], 2 * (dw + dh), anim);
    const fw = Math.min(50, Math.floor(dw * 0.22));
    const zFrame = D + FACADE_T - 3;
    b.decor(`${label}: рамка верх`, 'facade', [x0, y1 - fw, zFrame], [dw, fw, 3], anim);
    b.decor(`${label}: рамка низ`, 'facade', [x0, y0, zFrame], [dw, fw, 3], anim);
    if (dh > 2 * fw) {
      b.decor(`${label}: рамка лево`, 'facade', [x0, y0 + fw, zFrame], [fw, dh - 2 * fw, 3], anim);
      b.decor(`${label}: рамка право`, 'facade', [x1 - fw, y0 + fw, zFrame], [fw, dh - 2 * fw, 3], anim);
    }
  } else if (milling === 'ribbed') {
    // Рифлёный фасад (вельвет / рейки): основа + вертикальные рифленые рейки
    b.box(label, 'facade', [x0, y0, D], [dw, dh, FACADE_T - 4], 2 * (dw + dh), anim);
    const ribW = 12;
    const ribGap = 8;
    const step = ribW + ribGap;
    const nRibs = Math.floor((dw - 8) / step);
    const zRib = D + FACADE_T - 4;
    for (let ri = 0; ri < nRibs; ri++) {
      const rx = x0 + 4 + ri * step;
      b.decor(`${label}: рейка ${ri + 1}`, 'facade', [rx, y0, zRib], [ribW, dh, 4], anim);
    }
  } else {
    // Модерн (гладкий фасад)
    b.box(label, 'facade', [x0, y0, D], [dw, dh, FACADE_T], 2 * (dw + dh), anim);
  }

  b.add('hinge', isFlap ? 2 : hingesFor(dh));
  if (isFlap) {
    const t = m.t || 16;
    const armH = Math.max(60, Math.min(180, dh - 40));
    b.decor('Подъёмник: газлифт Л', 'metal', [Math.max(t + 2, x0 + 18), y1 - armH - 20, Math.max(40, D - 110)], [8, armH, 12]);
    b.decor('Подъёмник: газлифт П', 'metal', [Math.min(m.w - t - 10, x1 - 26), y1 - armH - 20, Math.max(40, D - 110)], [8, armH, 12]);
  } else {
    doorHinges(b, m, anim, x0, x1, y0, y1, hinge, D);
  }
  doorHandle(b, m, anim, x0, x1, y0, y1, hinge, D + FACADE_T);
}

/** Четырехшарнирные мебельные петли (Blum/Hettich) с монтажными планками, плечом и чашкой Ø35. */
function doorHinges(
  b: Builder, m: Module, anim: PartAnim, x0: number, x1: number, y0: number, y1: number,
  hinge: 'left' | 'right', D: number,
): void {
  const dh = y1 - y0;
  const numHinges = hingesFor(dh);
  const topBottom = 100;
  const isL = hinge === 'left';
  const step = numHinges > 1 ? (dh - 2 * topBottom) / (numHinges - 1) : 0;
  const t = m.t || 16;

  for (let hIdx = 0; hIdx < numHinges; hIdx++) {
    const yCenter = Math.round(y0 + topBottom + hIdx * step);

    // 1. Неподвижная часть на боковине корпуса (монтажная планка + плечо петли)
    // Монтажная планка крепится на ВНУТРЕННЮЮ плоскость боковины шкафа
    const xPlate = isL
      ? (x0 <= 25 ? t : Math.max(t, x0 + 1))
      : (x1 >= m.w - 25 ? m.w - t - 3 : Math.min(m.w - t - 3, x1 - 4));
    const yPlate = yCenter - 16;
    const zPlate = D - 50;
    b.decor('Петля: монтажная планка', 'metal', [xPlate, yPlate, zPlate], [3, 32, 16]);

    // Евровинты крепления планки к боковине
    const xScrew = isL ? xPlate - 0.5 : xPlate + 2.5;
    b.decor('Петля: винт планки', 'metal', [xScrew, yCenter + 11, zPlate + 6], [1, 3.5, 3.5]);
    b.decor('Петля: винт планки', 'metal', [xScrew, yCenter - 11, zPlate + 6], [1, 3.5, 3.5]);

    // Корпус (плечо) петли, защелкнутый на планку
    const xArm = isL ? xPlate + 0.5 : xPlate - 9.5;
    const yArm = yCenter - 5.5;
    const zArm = D - 38;
    b.decor('Петля: плечо', 'metal', [xArm, yArm, zArm], [9, 11, 35]);

    // Регулировочные винты на плече петли
    b.decor('Петля: винт регулировки', 'metal', [xArm + 1, yCenter + 5.5, zArm + 8], [7, 1.2, 4]);
    b.decor('Петля: винт фиксации', 'metal', [xArm + 1, yCenter + 5.5, zArm + 22], [7, 1.2, 4]);

    // 2. Подвижная часть на фасаде (поворачивается вместе со створкой!)
    // Чашка петли Ø35 мм, утопленная в тело фасада с внутренней стороны
    // k = 4 мм от края фасада, глубина 11.5 мм (не пробивает фасад насквозь!)
    const xCup = isL ? x0 + 4 : x1 - 39;
    const yCup = yCenter - 17.5;
    const zCup = D + 0.5;
    b.decor('Петля: чашка Ø35', 'metal', [xCup, yCup, zCup], [35, 35, 11.5], anim, 'cyl');

    // Фланец чашки с проушинами под саморезы на внутренней плоскости двери
    const xFlange = isL ? x0 + 13.5 : x1 - 29.5;
    const yFlange = yCenter - 24;
    const zFlange = D - 1;
    b.decor('Петля: фланец чашки', 'metal', [xFlange, yFlange, zFlange], [16, 48, 1.5], anim);

    // Шарнирный рычажный узел, связывающий плечо и чашку
    const xLink = isL ? x0 + 8 : x1 - 18;
    const yLink = yCenter - 4;
    const zLink = D - 8;
    b.decor('Петля: шарнир', 'metal', [xLink, yLink, zLink], [10, 8, 8], anim);
  }
}

function pickRail(maxLen: number): number {
  for (const r of [550, 500, 450, 400, 350, 300, 250]) if (r <= maxLen) return r;
  return 250;
}

function rectCabinet(b: Builder, m: Module, skipContinuous = false): void {
  const { w: W, h: H, d: D, t } = m;
  const wall = isWall(m.kind);
  const P = wall ? 0 : m.plinth;
  const bodyH = H - P;
  const BK = BACK_T;
  const n = m.sections.length;
  const slide = m.doorMode === 'sliding';
  const trimH = m.topTrim && m.topTrim > 0 && m.kind !== 'base' && m.kind !== 'corner' ? m.topTrim : 0;

  const isFridge = m.kind === 'tall' && /холодильник/i.test(m.name) && (!/встроен/i.test(m.name) || /невстроен/i.test(m.name)) && !/пенал/i.test(m.name);
  if (isFridge) {
    const legH = 22;
    const bodyD = Math.max(400, D - 26);
    const doorT = 24;
    const freezerH = Math.round((H - legH) * 0.34);
    const gap = 8;
    const fridgeH = H - legH - freezerH - gap;

    // 4 опоры холодильника
    b.decor('Опора холодильника', 'black', [24, 0, 24], [36, legH, 36], undefined, 'cyl');
    b.decor('Опора холодильника', 'black', [W - 60, 0, 24], [36, legH, 36], undefined, 'cyl');
    b.decor('Опора холодильника', 'black', [24, 0, bodyD - 60], [36, legH, 36], undefined, 'cyl');
    b.decor('Опора холодильника', 'black', [W - 60, 0, bodyD - 60], [36, legH, 36], undefined, 'cyl');

    // Основной теплоизолированный корпус (не попадает в раскрой ЛДСП!)
    b.decor('Холодильник: корпус', 'metal', [4, legH, 10], [W - 8, H - legH - 4, bodyD - 10]);

    // Нижняя дверца морозильной камеры + верхняя дверца холодильной камеры
    const zDoor = bodyD;
    b.decor('Морозильная камера (дверца)', 'metal', [2, legH, zDoor], [W - 4, freezerH, doorT]);
    b.decor('Холодильная камера (дверца)', 'metal', [2, legH + freezerH + gap, zDoor], [W - 4, fridgeH, doorT]);
    // Теневой зазор и уплотнитель между камерами
    b.decor('Уплотнитель', 'black', [6, legH + freezerH, zDoor - 4], [W - 12, gap, doorT + 2]);

    // Дисплей на верхней двери
    b.decor('Дисплей температуры', 'black', [Math.round(W / 2 - 48), legH + freezerH + gap + Math.round(fridgeH * 0.68), zDoor + doorT - 1], [96, 38, 2]);

    // Интегрированные или накладные вертикальные ручки
    if (m.handles) {
      const hx = m.mirror ? W - 34 : 22;
      b.decor('Ручка холодильника', 'handle', [hx, legH + freezerH + gap + 35, zDoor + doorT], [12, Math.min(480, fridgeH - 90), 22]);
      b.decor('Ручка морозилки', 'handle', [hx, legH + 35, zDoor + doorT], [12, Math.min(260, freezerH - 70), 22]);
    }
    return;
  }

  const isFiller = W <= 120 && n === 1 && m.sections[0].drawers === 0 && m.sections[0].shelves === 0 && m.doorMode === 'none';
  if (isFiller) {
    b.box('Фальшпланка фасада', 'facade', [0, P + 2, D], [W, bodyH - 4, FACADE_T], 2 * (W + bodyH));
    b.box('Монтажная планка ЛДСП', 'corpus', [0, P, BK], [t, bodyH, Math.max(80, D - BK)], bodyH);
    if (m.name.toLowerCase().includes('углов')) {
      b.box('Фальшпланка угла (возврат)', 'facade', [W - FACADE_T, P + 2, D - W], [FACADE_T, bodyH - 4, W], 2 * (W + bodyH));
    }
    b.add('confirmat', 4);
    if (P > 0) {
      if (!skipContinuous) {
        const plinthMat: PartMat = m.plinthColor === 'black' ? 'black' : m.plinthColor === 'facade' ? 'facade' : 'corpus';
        b.box('Цоколь', plinthMat, [0, 0, D - 50 - 16], [W, P, 16], W);
      }
      b.add('leg', 2);
    }
    if (m.countertop && m.kind === 'base' && !skipContinuous) {
      b.box('Столешница', 'top', [0, H, 0], [W, COUNTERTOP_T, D + 30], W);
    }
    if (trimH > 0) {
      if (!skipContinuous) {
        b.box('Верхняя планка (карниз)', 'facade', [0, H, D], [W, trimH, FACADE_T], 2 * (W + trimH));
      }
      b.add('confirmat', 2);
    }
    return;
  }

  const isSink = m.kind === 'base' && (m.name.toLowerCase().includes('мойк') || m.name.toLowerCase().includes('раковин') || (n === 1 && m.sections[0].shelves === 0 && m.sections[0].drawers === 0 && m.doorMode === 'hinged'));
  const isOven = m.kind === 'base' && (m.name.toLowerCase().includes('духов') || (n === 1 && m.sections[0].drawers === 1 && m.sections[0].shelves === 1 && m.doorMode === 'none'));
  const hasCooktop = m.kind === 'base' && (m.cooktop === true || (m.cooktop !== false && (isOven || /варочн|плит|индукц|конфорк/i.test(m.name))));
  const isTallOven = m.kind === 'tall' && /духов|свч/i.test(m.name);

  b.box('Боковина левая', 'corpus', [0, P, BK], [t, bodyH, D - BK], bodyH);
  b.box('Боковина правая', 'corpus', [W - t, P, BK], [t, bodyH, D - BK], bodyH);
  b.box('Дно', 'corpus', [t, P, BK], [W - 2 * t, t, D - BK], W - 2 * t);
  if (isSink) {
    // В тумбе под мойку ставятся царги жесткости под чашу и сантехнический просвет сзади
    b.box('Царга передняя', 'corpus', [t, H - 90, D - t - 10], [W - 2 * t, 90, t], W - 2 * t);
    b.box('Царга задняя', 'corpus', [t, H - 90, BK], [W - 2 * t, 90, t], W - 2 * t);
    b.box('Задняя стенка (сантех-цоколь)', 'back', [1, P + 1, 0], [W - 2, Math.min(220, bodyH - 2), BK], 0);
    b.add('confirmat', 8);
  } else if (isOven) {
    b.box('Крышка', 'corpus', [t, H - t, BK], [W - 2 * t, t, D - BK], W - 2 * t);
    // В нише духовки сзади открыто для вентиляции ТЭНов, задняя стенка только за нижним ящиком
    const ovenDrH = Math.min(220, m.drawerH || 160);
    b.box('Задняя стенка ящика', 'back', [1, P + 1, 0], [W - 2, ovenDrH, BK], 0);
    b.add('confirmat', 8);
  } else {
    b.box('Крышка', 'corpus', [t, H - t, BK], [W - 2 * t, t, D - BK], W - 2 * t);
    b.box('Задняя стенка', 'back', [1, P + 1, 0], [W - 2, bodyH - 2, BK], 0);
    b.add('confirmat', 8);
  }

  if (P > 0) {
    const plinthZ = D - 50 - 16;
    if (!skipContinuous) {
      const plinthMat: PartMat = m.plinthColor === 'black' ? 'black' : m.plinthColor === 'facade' ? 'facade' : 'corpus';
      // Если напольный модуль стоит на боковой стене у угла (m.x ≈ D..D+120), дотягиваем его цоколь до пересечения с цоколем задней стены
      const plinthJoin = (m.wall === 'left' || m.wall === 'right') && m.x > plinthZ && m.x <= D + 120 ? (m.x - plinthZ) : 0;
      const plinthX = m.wall === 'right' ? -plinthJoin : 0;
      const plinthW = W + plinthJoin;
      b.box('Цоколь', plinthMat, [plinthX, 0, plinthZ], [plinthW, P, 16], plinthW);
      const sidePlinthDepth = plinthZ - BK;
      if (sidePlinthDepth > 50) {
        b.box('Цоколь боковой L', plinthMat, [0, 0, BK], [16, P, sidePlinthDepth], sidePlinthDepth);
        b.box('Цоколь боковой R', plinthMat, [W - 16, 0, BK], [16, P, sidePlinthDepth], sidePlinthDepth);
      }
    }
    // 3D Регулируемые кухонные ножки-опоры с клипсами на внутренней стороне цоколя
    if (W >= 200 && D >= 240 && P >= 35) {
      const zFrontLeg = Math.max(BK + 10, plinthZ - 38);
      const zBackLeg = Math.max(BK + 10, Math.min(zFrontLeg - 40, BK + 45));
      const xL = Math.min(55, Math.floor(W * 0.18));
      const xR = Math.max(xL + 40, W - xL - 30);
      const legXs = W >= 800 ? [xL, Math.round(W / 2 - 15), xR] : [xL, xR];
      const clipZ = zFrontLeg + 24;
      const clipDepth = Math.max(4, plinthZ - 2 - clipZ);
      for (const lx of legXs) {
        b.decor('Опора регулируемая', 'black', [lx, 0, zFrontLeg], [30, P, 30], undefined, 'cyl');
        b.decor('Опора: клипса цоколя', 'black', [lx + 7, Math.round(P * 0.5), clipZ], [16, Math.min(18, Math.floor(P * 0.35)), clipDepth]);
        b.decor('Опора регулируемая', 'black', [lx, 0, zBackLeg], [30, P, 30], undefined, 'cyl');
      }
    }
    b.add('leg', W >= 800 ? 6 : 4);
  }
  if (wall) b.add('hanger', 1);

  const Wi = W - 2 * t;
  const cw = (Wi - (n - 1) * t) / n;
  const Hi = H - P - 2 * t;
  const cellX = (i: number) => t + i * (cw + t);

  for (let i = 1; i < n; i++) {
    b.box(`Перегородка ${i}`, 'corpus', [cellX(i) - t, P + t, BK], [t, Hi, D - BK], Hi);
    b.add('confirmat', 4);
  }

  m.sections.forEach((sec, i) => {
    const x0 = cellX(i);
    const nd = sec.drawers;
    const fullHeight = H - P - 4;
    const isFullHeight = (m.doorMode === 'none' || !sec.door) && sec.shelves === 0 && (sec.rods ?? 0) === 0 && !sec.rod;
    const fhStep = nd > 0
      ? (isTallOven ? Math.min(m.drawerH || 360, fullHeight / nd) : isFullHeight ? fullHeight / nd : Math.min(m.drawerH, fullHeight / nd))
      : 0;
    const zoneTop = nd > 0 ? P + Math.round(nd * fhStep) : P + t;

    // сегмент фасада по центру перегородок (с учётом утопленной глухой зоны и L-планки в углу)
    const segL = i === 0 ? 0 : x0 - t / 2;
    const segR = i === n - 1 ? W : x0 + cw + t / 2;
    let fx0 = segL + (i === 0 ? 1 : 1.5);
    let fx1 = segR - (i === n - 1 ? 1 : 1.5);
    let openZoneX0 = x0;
    let openZoneW = cw;

    const hasBlind = m.blindSide && (m.blindW ?? 0) > 0 && ((m.blindSide === 'left' && i === 0) || (m.blindSide === 'right' && i === n - 1));
    if (hasBlind) {
      const blindW = Math.min(Math.round((segR - segL) - 120), Math.max(25, m.blindW ?? (wall ? 340 : 605)));
      const fillerW = Math.min(blindW, Math.max(16, m.blindFillerW ?? (wall ? 40 : 45)));
      const blindPanelW = Math.max(0, blindW - fillerW);
      if (m.blindSide === 'left') {
        // Глухая заглушка + Г-образная угловая бленда 90° + внутренняя стойка-перегородка по линии blindW
        if (blindPanelW >= 20) {
          b.box('Глухая заглушка (угловая)', 'corpus', [1, P + 2, D - t], [blindPanelW, bodyH - 4, t], 2 * (blindPanelW + bodyH));
        }
        b.box(`Угловая бленда ${fillerW} мм`, 'facade', [blindPanelW, P + 2, D], [fillerW, bodyH - 4, FACADE_T], 2 * (fillerW + bodyH));
        // Перпендикулярный возврат бленды 90° заподлицо с фасадом соседней стены (перекрывает торец и даёт зазор открывания)
        const retDepth = Math.max(FACADE_T, fillerW);
        if (blindPanelW >= 20) {
          b.box('Угловая бленда (возврат 90°)', 'facade', [blindPanelW, P + 2, D + FACADE_T], [FACADE_T, bodyH - 4, retDepth], 2 * (retDepth + bodyH));
        }
        b.box('Стойка-перегородка угла', 'corpus', [Math.max(t, blindW - t), P + t, BK], [t, Hi, D - BK], Hi);
        fx0 = blindW + 2;
        openZoneX0 = Math.max(x0, blindW);
        openZoneW = Math.max(120, (x0 + cw) - openZoneX0);
      } else {
        const xStart = segR - blindW;
        if (blindPanelW >= 20) {
          b.box('Глухая заглушка (угловая)', 'corpus', [xStart + fillerW, P + 2, D - t], [blindPanelW, bodyH - 4, t], 2 * (blindPanelW + bodyH));
        }
        b.box(`Угловая бленда ${fillerW} мм`, 'facade', [xStart, P + 2, D], [fillerW, bodyH - 4, FACADE_T], 2 * (fillerW + bodyH));
        const retDepth = Math.max(FACADE_T, fillerW);
        if (blindPanelW >= 20) {
          b.box('Угловая бленда (возврат 90°)', 'facade', [xStart + fillerW - FACADE_T, P + 2, D + FACADE_T], [FACADE_T, bodyH - 4, retDepth], 2 * (retDepth + bodyH));
        }
        b.box('Стойка-перегородка угла', 'corpus', [Math.min(W - 2 * t, xStart), P + t, BK], [t, Hi, D - BK], Hi);
        fx1 = xStart - 2;
        openZoneW = Math.max(120, xStart - x0);
      }
      b.add('confirmat', 6);
    }

    // ящики
    if (nd > 0) {
      const rail = pickRail(D - BK - 40);
      const boxW = cw - 26;
      const zFront = slide ? D - FACADE_T - 1 : D;
      const milling = m.milling ?? 'modern';
      const fw = fx1 - fx0;

      for (let k = 0; k < nd; k++) {
        const yk = Math.round(P + 2 + k * fhStep);
        const ykNext = Math.round(P + 2 + (k + 1) * fhStep);
        const fhBox = (ykNext - yk) - 3;
        const boxH = Math.max(60, Math.min(220, fhBox - 50));
        const key = `${m.id}-drawer-${i}-${k}`;
        const anim: PartAnim = { type: 'drawer', key, travel: Math.min(rail * 0.8, 400) };
        const zs = D - 2 - rail - (slide ? FACADE_T + 1 : 0);
        const lbl = `Ящик ${nd > 1 ? k + 1 : ''}`.trim();

        if (milling === 'frame') {
          b.box(`${lbl}: фасад`, 'facade', [fx0, yk, zFront], [fw, fhBox, FACADE_T - 3], 2 * (fw + fhBox), anim);
          const fmw = Math.min(35, Math.floor(fhBox * 0.25));
          const zf = zFront + FACADE_T - 3;
          b.decor(`${lbl}: рамка верх`, 'facade', [fx0, yk + fhBox - fmw, zf], [fw, fmw, 3], anim);
          b.decor(`${lbl}: рамка низ`, 'facade', [fx0, yk, zf], [fw, fmw, 3], anim);
          if (fhBox > 2 * fmw) {
            b.decor(`${lbl}: рамка лево`, 'facade', [fx0, yk + fmw, zf], [fmw, fhBox - 2 * fmw, 3], anim);
            b.decor(`${lbl}: рамка право`, 'facade', [fx1 - fmw, yk + fmw, zf], [fmw, fhBox - 2 * fmw, 3], anim);
          }
        } else if (milling === 'ribbed') {
          b.box(`${lbl}: фасад`, 'facade', [fx0, yk, zFront], [fw, fhBox, FACADE_T - 4], 2 * (fw + fhBox), anim);
          const ribW = 12;
          const ribGap = 8;
          const step = ribW + ribGap;
          const nRibs = Math.floor((fw - 8) / step);
          const zr = zFront + FACADE_T - 4;
          for (let ri = 0; ri < nRibs; ri++) {
            const rx = fx0 + 4 + ri * step;
            b.decor(`${lbl}: рейка ${ri + 1}`, 'facade', [rx, yk, zr], [ribW, fhBox, 4], anim);
          }
        } else {
          b.box(`${lbl}: фасад`, 'facade', [fx0, yk, zFront], [fw, fhBox, FACADE_T], 2 * (fw + fhBox), anim);
        }

        const isPulloutMech = m.kind === 'base' && nd === 1 && /механизм|карго|бутылочн/i.test(m.name);
        if (isPulloutMech) {
          // Встроенный выдвижной многоуровневый сетчатый механизм (на 200 / 300 / 400 мм) с доводчиком
          const basketLevels = fhBox >= 550 ? 2 : 1;
          for (let bl = 0; bl < basketLevels; bl++) {
            const by = yk + 45 + bl * Math.round((fhBox - 150) / Math.max(1, basketLevels));
            b.decor('Выдвижная корзина: дно', 'metal', [x0 + 24, by, zs + 16], [Math.max(80, boxW - 22), 6, rail - 28], anim);
            b.decor('Выдвижная корзина: борт Л', 'metal', [x0 + 22, by + 6, zs + 16], [5, 58, rail - 28], anim);
            b.decor('Выдвижная корзина: борт П', 'metal', [x0 + cw - 27, by + 6, zs + 16], [5, 58, rail - 28], anim);
            b.decor('Выдвижная корзина: борт задний', 'metal', [x0 + 22, by + 6, zs + 16], [Math.max(84, boxW - 18), 58, 5], anim);
          }
          if (m.w >= 350) b.add('mech400');
          else b.add('rail');
        } else {
          b.box(`${lbl}: бок`, 'corpus', [x0 + 13, yk + 30, zs], [16, boxH, rail], 0, anim);
          b.box(`${lbl}: бок`, 'corpus', [x0 + cw - 13 - 16, yk + 30, zs], [16, boxH, rail], 0, anim);
          b.box(`${lbl}: задняя`, 'corpus', [x0 + 13 + 16, yk + 30, zs], [boxW - 32, boxH, 16], 0, anim);
          b.box(`${lbl}: дно`, 'back', [x0 + 13 + 12, yk + 38, zs + 8], [boxW - 24, 4, rail - 16], 0, anim);
          b.add('rail');
        }
        // Встроенная выдвижная сушка для посуды в верхнем ящике (если модуль предназначен под сушку)
        if (m.kind === 'base' && /сушк/i.test(m.name) && k === nd - 1 && boxW > 200) {
          b.decor('Сушка в ящике: поддон (нерж.)', 'metal', [x0 + 34, yk + 44, zs + 16], [boxW - 42, 4, rail - 32], anim);
          b.decor('Сушка в ящике: решётка (тарелки)', 'metal', [x0 + 40, yk + 52, zs + 24], [boxW - 54, 16, Math.max(80, rail - 60)], anim);
        }
        if (m.handles) {
          const hMat = resolveHandleMat(m);
          if (m.handlePos === 'edge-top') {
            const hw = Math.max(100, Math.min(260, (fx1 - fx0) * 0.45));
            b.decor('Ручка торцевая', hMat, [(fx0 + fx1 - hw) / 2, yk + fhBox - 4, zFront], [hw, 4, FACADE_T + 18], anim);
          } else {
            const hw = Math.min(220, Math.max(96, (fx1 - fx0) * 0.5));
            b.decor('Ручка', hMat, [(fx0 + fx1) / 2 - hw / 2, yk + fhBox - 38, zFront + FACADE_T], [hw, 14, 22], anim);
          }
          b.add('handle');
        }
      }

      // Если над ящиками есть полки или штанга, ставим разделительный горизонт
      if (!isFullHeight && (isTallOven || sec.shelves > 0 || (sec.rods ?? 0) > 0 || sec.rod)) {
        b.box(isTallOven ? 'Горизонт под духовку' : 'Горизонт над ящиками', 'corpus', [x0, zoneTop, BK], [cw, t, D - BK - (isTallOven ? 0 : 20)], cw);
        b.add('confirmat', 4);
      }
    }

    // Расчёт открытой ниши под встроенную духовку и СВЧ в пенале (полностью настраиваемые высоты)
    const zTop = H - t;
    const zones = getTallOvenZones(m);
    let upperZoneBottom = zoneTop;
    if (isTallOven && i === 0) {
      if (nd === 0) {
        b.box('Горизонт под духовку', 'corpus', [x0, zones.yHor1, BK], [cw, t, D - BK], cw);
        b.add('confirmat', 4);
      }
      if (zones.hasOven) {
        b.box('Горизонт над духовкой', 'corpus', [x0, zones.yOv1, BK], [cw, t, D - BK], cw);
        b.add('confirmat', 4);
        if (cw >= 360) {
          b.decor('Духовой шкаф: корпус', 'black', [x0 + 2, zones.yOv0 + 2, Math.max(BK + 20, D - 45)], [cw - 4, zones.ovenH - 4, 42]);
          b.decor('Духовой шкаф: панель управления', 'metal', [x0 + 4, zones.yOv1 - 92, D - 2], [cw - 8, 86, 4]);
          b.decor('Духовой шкаф: дисплей', 'black', [x0 + cw / 2 - 55, zones.yOv1 - 72, D + 1], [110, 42, 3]);
          b.decor('Духовой шкаф: панорамное стекло', 'black', [x0 + 4, zones.yOv0 + 6, D - 2], [cw - 8, Math.max(80, zones.ovenH - 104), 5]);
          b.decor('Духовой шкаф: ручка', 'handle', [x0 + 36, zones.yOv1 - 126, D + 3], [cw - 72, 12, 20]);
        }
        upperZoneBottom = zones.yOv1 + t;

        if (zones.hasMw) {
          b.box('Горизонт над СВЧ', 'corpus', [x0, zones.yMw1, BK], [cw, t, D - BK], cw);
          b.add('confirmat', 4);
          if (cw >= 360) {
            b.decor('СВЧ встроенная: рамка', 'metal', [x0 + 2, zones.yMw0 + 2, D - 3], [cw - 4, zones.mwH - 4, 4]);
            b.decor('СВЧ встроенная: стекло дверцы', 'black', [x0 + 18, zones.yMw0 + 18, D + 1], [Math.max(120, cw - 130), zones.mwH - 36, 3]);
            b.decor('СВЧ встроенная: панель управления', 'black', [x0 + cw - 102, zones.yMw0 + 18, D + 1], [84, zones.mwH - 36, 3]);
          }
          upperZoneBottom = zones.yMw1 + t;
        }
      }
    }

    // полки и штанги
    const rodsCount = typeof sec.rods === 'number' ? sec.rods : (sec.rod ? 1 : 0);

    if (rodsCount === 2) {
      // Двухъярусная штанга
      if (sec.shelves >= 2) {
        // 2 полки (антресоль + средняя) + 2 штанги
        const yTopShelf = H - t - 320;
        const yMidShelf = Math.round((yTopShelf + zoneTop) / 2);
        b.box('Антресольная полка', 'corpus', [x0, yTopShelf, BK], [cw, t, D - BK - 20], cw);
        b.add('pin', 4);
        b.box('Средняя полка', 'corpus', [x0, yMidShelf, BK], [cw, t, D - BK - 20], cw);
        b.add('pin', 4);

        b.decor('Штанга верхняя', 'metal', [x0, yTopShelf - 75, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.decor('Штанга нижняя', 'metal', [x0, yMidShelf - 75, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.add('rod', (cw * 2) / 1000);
        b.add('rodHolder', 4);
      } else if (sec.shelves === 1) {
        // 1 антресольная полка + 2 штанги
        const yTopShelf = H - t - 320;
        b.box('Антресольная полка', 'corpus', [x0, yTopShelf, BK], [cw, t, D - BK - 20], cw);
        b.add('pin', 4);

        const yMid = Math.round((yTopShelf + zoneTop) / 2);
        b.decor('Штанга верхняя', 'metal', [x0, yTopShelf - 75, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.decor('Штанга нижняя', 'metal', [x0, yMid, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.add('rod', (cw * 2) / 1000);
        b.add('rodHolder', 4);
      } else {
        // Только 2 штанги (верхний и нижний ярус под рубашки/пиджаки)
        const yUpper = H - t - 85;
        const yLower = Math.round((yUpper + zoneTop) / 2);
        b.decor('Штанга верхняя', 'metal', [x0, yUpper, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.decor('Штанга нижняя', 'metal', [x0, yLower, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.add('rod', (cw * 2) / 1000);
        b.add('rodHolder', 4);
      }
    } else if (rodsCount === 1) {
      if (sec.shelves >= 1) {
        // Антресольная полка сверху + штанга под ней
        const yTopShelf = H - t - 320;
        b.box('Антресольная полка', 'corpus', [x0, yTopShelf, BK], [cw, t, D - BK - 20], cw);
        b.add('pin', 4);
        b.decor('Штанга', 'metal', [x0, yTopShelf - 75, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.add('rod', cw / 1000);
        b.add('rodHolder', 2);

        // Остальные полки снизу (под обувь/коробки)
        const remShelves = sec.shelves - 1;
        for (let k = 1; k <= remShelves; k++) {
          const y = zoneTop + (k * (yTopShelf - 900 - zoneTop)) / (remShelves + 1) - t / 2;
          b.box('Полка нижняя', 'corpus', [x0, Math.max(zoneTop + 100, y), BK], [cw, t, D - BK - 20], cw);
          b.add('pin', 4);
        }
      } else {
        b.decor('Штанга', 'metal', [x0, H - t - 85, D / 2 - 12], [cw, 25, 25], undefined, 'cyl');
        b.add('rod', cw / 1000);
        b.add('rodHolder', 2);
      }
    } else {
      // Только полки (или двухъярусная хромированная сушка для посуды)
      const shelfZoneBase = isTallOven && i === 0 ? upperZoneBottom : zoneTop;
      const zoneH = zTop - shelfZoneBase;
      const isDishDryer = isWall(m.kind) && /сушк/i.test(m.name) && sec.shelves >= 2 && D >= 240;
      if (isDishDryer) {
        const yTray = shelfZoneBase + 35;
        const yPlates = shelfZoneBase + Math.round(zoneH * 0.28);
        const yCups = shelfZoneBase + Math.round(zoneH * 0.62);
        b.decor('Поддон сушки (нерж.)', 'metal', [x0 + 4, yTray, BK + 12], [cw - 8, 6, D - BK - 32]);
        b.decor('Сушилка хромированная (тарелки)', 'metal', [x0 + 2, yPlates, BK + 10], [cw - 4, 14, D - BK - 28]);
        b.decor('Сушилка хромированная (чашки)', 'metal', [x0 + 2, yCups, BK + 10], [cw - 4, 12, D - BK - 28]);
        b.add('pin', 8);
      } else {
        const vitFrame = isVitrineFacade(m);
        const nShelvesToPlace = sec.shelves;
        if (vitFrame) {
          // Врезная тёплая LED-подсветка внутри шкафа-витрины (вертикальные световые линии в боковинах + верхний профиль)
          b.decor('LED-подсветка витрины (верх)', 'led-warm', [openZoneX0 + 8, zTop - 5, Math.min(D - 28, Math.max(40, D * 0.55))], [Math.max(40, openZoneW - 16), 5, 10]);
          b.decor('LED-линия боковая Л', 'led-warm', [openZoneX0 + 1, shelfZoneBase + 8, Math.max(30, D - 75)], [4, Math.max(60, zoneH - 16), 8]);
          b.decor('LED-линия боковая П', 'led-warm', [openZoneX0 + openZoneW - 5, shelfZoneBase + 8, Math.max(30, D - 75)], [4, Math.max(60, zoneH - 16), 8]);
          b.add('ledVitrine', 1);
        }
        for (let k = 1; k <= nShelvesToPlace; k++) {
          const y = shelfZoneBase + (k * zoneH) / (nShelvesToPlace + 1) - t / 2;
          if (vitFrame) {
            const glassShelfMat: PartMat = vitFrame === 'gold' ? 'glass-bronze' : 'glass-graphite';
            b.decor('Полка стеклянная (витрина)', glassShelfMat, [openZoneX0 + 2, y + 4, BK + 6], [openZoneW - 4, 8, D - BK - 26]);
            b.decor('LED-подсветка полки', 'led-warm', [openZoneX0 + 8, y + 5, BK + 4], [Math.max(40, openZoneW - 16), 6, 8]);
          } else {
            b.box('Полка', 'corpus', [openZoneX0, y, BK], [openZoneW, t, D - BK - 20], openZoneW);
          }
          b.add('pin', 4);
        }
      }
    }

    // Встроенный духовой шкаф в тумбе под духовку (isOven)
    if (isOven && i === 0) {
      const yOv0 = zoneTop + t;
      const ovH = zTop - yOv0;
      if (ovH >= 320 && cw >= 360) {
        b.decor('Духовой шкаф: корпус', 'black', [x0 + 2, yOv0 + 2, Math.max(BK + 20, D - 45)], [cw - 4, ovH - 4, 42]);
        b.decor('Духовой шкаф: панель управления', 'metal', [x0 + 4, zTop - 92, D - 2], [cw - 8, 86, 4]);
        b.decor('Духовой шкаф: дисплей', 'black', [x0 + cw / 2 - 55, zTop - 72, D + 1], [110, 42, 3]);
        b.decor('Духовой шкаф: панорамное стекло', 'black', [x0 + 4, yOv0 + 6, D - 2], [cw - 8, Math.max(80, ovH - 104), 5]);
        b.decor('Духовой шкаф: ручка', 'handle', [x0 + 36, zTop - 126, D + 3], [cw - 72, 12, 20]);
      }
    }

    // распашные и подъёмные двери
    if (m.doorMode === 'hinged' && sec.door) {
      const y0 = isTallOven && i === 0 && upperZoneBottom > zoneTop
        ? upperZoneBottom - Math.round(t / 2) + 1
        : (nd > 0 ? P + 2 + Math.round(nd * fhStep) : P + 2);
      const y1 = H - 2;
      if (y1 - y0 > 100) {
        const segW = fx1 - fx0;
        const nDoors = isDoubleDoorSection(m, segW) ? 2 : 1;
        const gap = 3;
        const dw = (segW - gap * (nDoors - 1)) / nDoors;
        for (let k = 0; k < nDoors; k++) {
          const a = fx0 + k * (dw + gap);
          let hinge: 'left' | 'right' | 'top';
          if (nDoors === 1) {
            if (m.hinge === 'top') {
              hinge = 'top';
            } else {
              let desired: 'left' | 'right';
              if (n > 1) {
                desired = i < n / 2 ? 'left' : 'right';
              } else {
                desired = m.hinge ? (m.hinge === 'right' ? 'right' : 'left') : (m.blindSide === 'left' ? 'right' : 'left');
              }
              hinge = m.mirror ? (desired === 'left' ? 'right' : 'left') : desired;
            }
          } else {
            hinge = k === 0 ? 'left' : 'right';
          }
          frontDoor(b, m, nDoors > 1 ? `Фасад (дверь ${k + 1})` : 'Фасад (дверь)', a, a + dw, y0, y1, hinge, D, `${m.id}-door-${i}-${k}`);
        }
      }
    }
  });

  // двери-купе с анимацией сдвига
  if (slide) {
    const nS = m.slidingCount;
    const overlap = 30;
    const dw = (W + (nS - 1) * overlap) / nS;
    const y0 = P + 4;
    const hd = H - P - 8;
    const slideDist = Math.round((dw - overlap) * 0.92);
    for (let k = 0; k < nS; k++) {
      const travelX = k < Math.ceil(nS / 2) ? slideDist : -slideDist;
      const anim: PartAnim = { type: 'sliding', key: `${m.id}-slide-${k}`, travelX };
      b.box(
        `Дверь купе ${k + 1}`, 'facade',
        [k * (dw - overlap), y0, D + 8 + (k % 2) * (FACADE_T + 3)],
        [dw, hd, FACADE_T], 2 * (dw + hd), anim,
      );
      b.add('sliding');
    }
  }

  if (m.countertop && (m.kind === 'base')) {
    if (!skipContinuous) {
      // Если модуль на боковой стене с отступом под угловую L-планку (x ≈ 530..580), дотягиваем столешницу до стыка с задней столешницей (D+30)
      const joinExtra = (m.wall === 'left' || m.wall === 'right') && m.x > D + 30 && m.x <= D + 90 ? (m.x - (D + 30)) : 0;
      const topW = W + joinExtra;
      const topX = m.wall === 'right' ? -joinExtra : 0;
      b.box('Столешница', 'top', [topX, H, 0], [topW, COUNTERTOP_T, D + 30], topW);
    }
    // Врезная мойка на тумбе под мойку (центрируется в открытой зоне при наличии глухой угловой части)
    if (isSink && W >= 400 && D >= 450) {
      const openX0 = m.blindSide === 'left' && (m.blindW ?? 0) > 0 ? (m.blindW ?? 0) : 0;
      const openX1 = m.blindSide === 'right' && (m.blindW ?? 0) > 0 ? W - (m.blindW ?? 0) : W;
      const openW = Math.max(400, openX1 - openX0);
      const sw = Math.min(580, openW - 70);
      const sd = Math.min(430, D - 110);
      const sx = Math.round(openX0 + (openW - sw) / 2);
      const sz = Math.round((D - sd) / 2) + 10;
      const tapMat = resolveHandleMat(m);
      b.decor('Мойка врезная: бортик', 'metal', [sx, H + COUNTERTOP_T - 1, sz], [sw, 2, sd]);
      b.decor('Мойка врезная: чаша', 'black', [sx + 22, H + COUNTERTOP_T - 0.5, sz + 44], [sw - 44, 2.2, sd - 64]);
      b.decor('Мойка: сливной клапан', 'metal', [sx + sw / 2 - 22, H + COUNTERTOP_T, sz + sd / 2], [44, 2.5, 44], undefined, 'cyl');
      // Объёмный высокий кухонный смеситель (в цвет фурнитуры: Золото / Чёрный / Хром)
      const tx = sx + Math.round(sw / 2);
      const tz = sz + 18;
      b.decor('Смеситель: база', tapMat, [tx - 21, H + COUNTERTOP_T, tz - 21], [42, 18, 42], undefined, 'cyl');
      b.decor('Смеситель: стойка', tapMat, [tx - 11, H + COUNTERTOP_T + 16, tz - 11], [22, 250, 22], undefined, 'cyl');
      b.decor('Смеситель: излив', tapMat, [tx - 10, H + COUNTERTOP_T + 252, tz - 10], [20, 18, 175]);
      b.decor('Смеситель: аэратор', tapMat, [tx - 10, H + COUNTERTOP_T + 224, tz + 145], [20, 30, 20], undefined, 'cyl');
      b.decor('Смеситель: рычаг', tapMat, [tx + 11, H + COUNTERTOP_T + 52, tz - 6], [42, 10, 12]);
    }
    // Встроенная индукционная варочная панель (работает как над духовкой, так и на модуле с выдвижными ящиками!)
    if (hasCooktop && W >= 450 && D >= 450) {
      const cwTop = Math.min(560, W - 60);
      const cdTop = Math.min(450, D - 70);
      const cxTop = Math.round((W - cwTop) / 2);
      const czTop = Math.round((D + 20 - cdTop) / 2);
      b.decor('Варочная панель: стеклокерамика', 'black', [cxTop, H + COUNTERTOP_T - 0.5, czTop], [cwTop, 4, cdTop]);
      const rZone = Math.min(140, Math.floor(Math.min(cwTop, cdTop) * 0.33));
      b.decor('Варочная панель: конфорка 1', 'metal', [cxTop + 36, H + COUNTERTOP_T + 3.2, czTop + 30], [rZone, 1.2, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 2', 'metal', [cxTop + cwTop - rZone - 36, H + COUNTERTOP_T + 3.2, czTop + 30], [rZone, 1.2, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 3', 'metal', [cxTop + 36, H + COUNTERTOP_T + 3.2, czTop + cdTop - rZone - 42], [rZone, 1.2, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 4', 'metal', [cxTop + cwTop - rZone - 36, H + COUNTERTOP_T + 3.2, czTop + cdTop - rZone - 42], [rZone, 1.2, rZone], undefined, 'cyl');
      b.decor('Варочная панель: сенсор', 'metal', [cxTop + cwTop / 2 - 65, H + COUNTERTOP_T + 3.2, czTop + cdTop - 22], [130, 1.2, 10]);
    }
  }

  if (trimH > 0) {
    if (!skipContinuous) {
      b.box('Верхняя планка (карниз)', 'facade', [0, H, D], [W, trimH, FACADE_T], 2 * (W + trimH));
    }
    b.add('confirmat', 4);
  }
}

function cornerCabinet(b: Builder, m: Module): void {
  const S1 = m.w;
  const S2 = Math.max(m.d + 180, m.cornerW2 ?? m.w);
  const { h: H, d: D, t } = m;
  const wall = isWall(m.kind);
  const P = wall ? 0 : m.plinth;
  const bodyH = H - P;
  const BK = BACK_T;
  const sec = m.sections[0];
  const Hi = H - P - 2 * t;
  const trimH = m.topTrim && m.topTrim > 0 && m.kind === 'cornerWall' ? m.topTrim : 0;
  const isDiag = m.cornerMode === 'diagonal';
  const hasSink = m.kind === 'corner' && (m.cornerSink === true || /мойк|раковин/i.test(m.name));

  // Задние стенки и торцевые боковины (стыкуются заподлицо с соседними шкафами глубины D по обеим стенам)
  b.box('Боковина задняя L', 'corpus', [0, P, BK], [t, bodyH, S2 - BK], bodyH);
  b.box('Боковина бокового крыла (торец)', 'corpus', [t, P, S2 - t], [D - t, bodyH, t], bodyH);
  b.box('Боковина основного крыла (торец)', 'corpus', [S1 - t, P, BK], [t, bodyH, D - BK], bodyH);
  b.box('Задняя стенка (основная)', 'back', [1, P + 1, 0], [S1 - 2, bodyH - 2, BK], 0);
  b.box('Задняя стенка (боковая)', 'back', [0, P + 1, BK], [BK, bodyH - 2, S2 - BK - 1], 0);

  if (isDiag) {
    // ——— ТРАПЕЦИЕВИДНЫЙ (ПЯТИУГОЛЬНЫЙ 45°) УГЛОВОЙ МОДУЛЬ ———
    // Диагональный проём идёт от точки A=(D, S2) до B=(S1, D)
    const dx = S1 - D;
    const dz = S2 - D;
    const diagLen = Math.hypot(dx, dz);
    const angleDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
    const nx = dz / diagLen;
    const nz = dx / diagLen;
    const midX = (D + S1) / 2;
    const midZ = (S2 + D) / 2;

    // Прямоугольное ядро дна и крышки + диагональный треугольный сегмент (аппроксимирован скошенной плитой вписанной геометрии)
    b.box('Дно (основа пятиугольная)', 'corpus', [t, P, BK], [S1 - 2 * t, t, D - BK], S1 - 2 * t);
    b.box('Дно (боковое крыло)', 'corpus', [t, P, D], [D - t, t, S2 - t - D], S2 - t - D);
    const diagPlateDepth = Math.min(dx, dz) * 0.7;
    const dcx = midX - nx * (diagPlateDepth / 2);
    const dcz = midZ - nz * (diagPlateDepth / 2);
    b.box('Дно (диагональный сектор)', 'corpus', [dcx - (diagLen - 8) / 2, P, dcz - diagPlateDepth / 2], [Math.max(80, diagLen - 8), t, diagPlateDepth], diagLen, undefined, false, angleDeg);

    if (!hasSink) {
      b.box('Крышка (основа пятиугольная)', 'corpus', [t, H - t, BK], [S1 - 2 * t, t, D - BK], S1 - 2 * t);
      b.box('Крышка (боковое крыло)', 'corpus', [t, H - t, D], [D - t, t, S2 - t - D], S2 - t - D);
      b.box('Крышка (диагональный сектор)', 'corpus', [dcx - (diagLen - 8) / 2, H - t, dcz - diagPlateDepth / 2], [Math.max(80, diagLen - 8), t, diagPlateDepth], diagLen, undefined, false, angleDeg);
    } else {
      // Царга жёсткости под врезную угловую мойку
      b.box('Царга диагональная (под мойку)', 'corpus', [midX - nx * 12 - (diagLen - 16) / 2, H - 90, midZ - nz * 12 - t / 2], [Math.max(100, diagLen - 16), 90, t], diagLen, undefined, true, angleDeg);
    }
    b.add('confirmat', 16);

    if (P > 0) {
      const plinthMat: PartMat = m.plinthColor === 'black' ? 'black' : m.plinthColor === 'facade' ? 'facade' : 'corpus';
      const inset = 50 + 8;
      const px = midX - nx * inset;
      const pz = midZ - nz * inset;
      const pw = Math.max(100, diagLen + 24);
      b.box('Цоколь диагональный 45°', plinthMat, [px - pw / 2, 0, pz - 8], [pw, P, 16], pw, undefined, true, angleDeg);
      b.decor('Опора регулируемая', 'black', [45, 0, 45], [30, P, 30], undefined, 'cyl');
      b.decor('Опора регулируемая', 'black', [S1 - 75, 0, 45], [30, P, 30], undefined, 'cyl');
      b.decor('Опора регулируемая', 'black', [45, 0, S2 - 75], [30, P, 30], undefined, 'cyl');
      b.decor('Опора регулируемая', 'black', [D - 45, 0, S2 - 75], [30, P, 30], undefined, 'cyl');
      b.decor('Опора регулируемая', 'black', [S1 - 75, 0, D - 45], [30, P, 30], undefined, 'cyl');
      b.add('leg', 5);
    }
    if (wall) b.add('hanger', 2);

    const zoneTop = P + t;
    const zoneH = H - t - zoneTop;
    const nSh = hasSink ? 0 : sec.shelves;
    for (let k = 1; k <= nSh; k++) {
      const y = zoneTop + (k * zoneH) / (nSh + 1) - t / 2;
      b.box('Полка пятиугольная (часть 1)', 'corpus', [t, y, BK], [S1 - 2 * t, t, D - BK - 12], S1 - 2 * t);
      b.box('Полка пятиугольная (часть 2)', 'corpus', [t, y, D - 12], [D - t - 12, t, S2 - t - (D - 12)], S2 - D);
      const spD = Math.max(40, diagPlateDepth - 18);
      const scx = midX - nx * (spD / 2 + 16);
      const scz = midZ - nz * (spD / 2 + 16);
      b.box('Полка (диагональ)', 'corpus', [scx - (diagLen - 32) / 2, y, scz - spD / 2], [Math.max(60, diagLen - 32), t, spD], diagLen - 32, undefined, false, angleDeg);
      b.add('pin', 6);
    }

    // Диагональный фасад 45° (одна широкая дверца на петлях 45°)
    if (m.doorMode !== 'none' && sec.door && Hi > 100) {
      const y0 = P + 2;
      const hd = H - 4 - P;
      const dw = Math.max(140, Math.round(diagLen - 6));
      const hingeRight = m.hinge === 'right';
      const pivX = hingeRight ? S1 - 2 : D + 2;
      const pivZ = hingeRight ? D + 2 : S2 - 2;
      const anim: PartAnim = {
        type: 'door',
        key: `${m.id}-door-diag`,
        pivot: [pivX + nx * (FACADE_T / 2), pivZ + nz * (FACADE_T / 2)],
        ang: hingeRight ? 85 : -85,
      };
      const fcx = midX + nx * (FACADE_T / 2 + 1);
      const fcz = midZ + nz * (FACADE_T / 2 + 1);
      b.box('Фасад угловой 45°', 'facade', [fcx - dw / 2, y0, fcz - FACADE_T / 2], [dw, hd, FACADE_T], 2 * (dw + hd), anim, true, angleDeg);
      b.add('hinge', hingesFor(hd));

      if (m.handles) {
        const hl = Math.max(100, Math.min(300, hd * 0.25));
        const hy = wall ? y0 + 30 : y0 + hd - 30 - hl;
        // Смещаем ручку к краю, противоположному петлям, вдоль диагонали
        const along = (hingeRight ? -1 : 1) * (dw / 2 - 34);
        const ux = dx / diagLen;
        const uz = -dz / diagLen;
        const hcx = midX + ux * along + nx * (FACADE_T + 12);
        const hcz = midZ + uz * along + nz * (FACADE_T + 12);
        b.decor('Ручка', 'handle', [hcx - 7, hy, hcz - 11], [14, hl, 22], anim, 'box', angleDeg);
        b.add('handle');
      }
    }

    if (m.countertop && m.kind === 'corner') {
      const topOut = D + 30;
      const tdx = Math.max(40, S1 - topOut);
      const tdz = Math.max(40, S2 - topOut);
      const tDiag = Math.hypot(tdx, tdz);
      const tMidX = (topOut + S1) / 2;
      const tMidZ = (S2 + topOut) / 2;
      b.box('Столешница пятиугольная (основа)', 'top', [0, H, 0], [S1, COUNTERTOP_T, topOut], S1);
      b.box('Столешница пятиугольная (крыло)', 'top', [0, H, topOut], [topOut, COUNTERTOP_T, Math.max(20, S2 - topOut)], topOut);
      const tPlateD = Math.min(tdx, tdz) * 0.72;
      b.box('Столешница (скос 45°)', 'top', [tMidX - nx * (tPlateD / 2) - tDiag / 2, H, tMidZ - nz * (tPlateD / 2) - tPlateD / 2], [tDiag, COUNTERTOP_T, tPlateD], tDiag, undefined, false, angleDeg);
      b.decor('Пристенный бортик (осн.)', 'top', [0, H + COUNTERTOP_T, 0], [S1, 24, 16]);
      b.decor('Пристенный бортик (бок.)', 'top', [0, H + COUNTERTOP_T, 16], [16, 24, S2 - 16]);

      if (hasSink) {
        const sw = Math.min(480, Math.round(diagLen + 40));
        const sd = 400;
        const scx = midX - nx * 195;
        const scz = midZ - nz * 195;
        b.decor('Мойка угловая 45°: бортик', 'metal', [scx - sw / 2, H + COUNTERTOP_T - 1, scz - sd / 2], [sw, 2, sd], undefined, 'box', angleDeg);
        b.decor('Мойка угловая 45°: чаша', 'black', [scx - (sw - 48) / 2, H + COUNTERTOP_T - 0.5, scz + 10 - (sd - 68) / 2], [sw - 48, 2.2, sd - 68], undefined, 'box', angleDeg);
        b.decor('Смеситель угловой', 'metal', [scx - nx * (sd / 2 - 26) - 18, H + COUNTERTOP_T, scz - nz * (sd / 2 - 26) - 18], [36, 28, 36], undefined, 'cyl');
      }
    }

    if (trimH > 0) {
      const fcx = midX + nx * (FACADE_T / 2 + 1);
      const fcz = midZ + nz * (FACADE_T / 2 + 1);
      b.box('Верхняя планка (карниз 45°)', 'facade', [fcx - diagLen / 2, H, fcz - FACADE_T / 2], [diagLen, trimH, FACADE_T], 2 * (diagLen + trimH), undefined, true, angleDeg);
      b.add('confirmat', 4);
    }
    return;
  }

  // ——— Г-ОБРАЗНЫЙ 90° УГЛОВОЙ МОДУЛЬ (ФАСАД-ГАРМОШКА BI-FOLD БЕЗ ЩЕЛИ) ———
  // Г-образное дно и крышка (из 2 частей без пересечений)
  b.box('Дно (боковое крыло)', 'corpus', [t, P, BK], [D - t, t, S2 - t - BK], S2 - t - BK);
  b.box('Дно (основное крыло)', 'corpus', [D, P, BK], [S1 - t - D, t, D - BK], S1 - t - D);
  if (!hasSink) {
    b.box('Крышка (боковое крыло)', 'corpus', [t, H - t, BK], [D - t, t, S2 - t - BK], S2 - t - BK);
    b.box('Крышка (основное крыло)', 'corpus', [D, H - t, BK], [S1 - t - D, t, D - BK], S1 - t - D);
  } else {
    b.box('Царга верхняя (боковое крыло)', 'corpus', [D - t - 10, H - 90, D], [t, 90, S2 - t - D], S2 - t - D);
    b.box('Царга верхняя (основное крыло)', 'corpus', [t, H - 90, D - t - 10], [S1 - 2 * t, 90, t], S1 - 2 * t);
  }
  // Внутренняя угловая планка притвора (исключает просвет на стыке двух створок)
  b.box('Планка притвора угла', 'corpus', [D - t, P + t, D - t], [t, Hi, t], Hi);
  b.add('confirmat', 18);

  if (P > 0) {
    const plinthMat: PartMat = m.plinthColor === 'black' ? 'black' : m.plinthColor === 'facade' ? 'facade' : 'corpus';
    const px = Math.max(t, D - 50 - 16);
    const pz = Math.max(t, D - 50 - 16);
    b.box('Цоколь внутренний (основное крыло)', plinthMat, [px, 0, pz], [S1 - px, P, 16], S1 - px);
    b.box('Цоколь внутренний (боковое крыло)', plinthMat, [px, 0, pz + 16], [16, P, S2 - (pz + 16)], S2 - (pz + 16));
    b.decor('Опора регулируемая', 'black', [45, 0, 45], [30, P, 30], undefined, 'cyl');
    b.decor('Опора регулируемая', 'black', [S1 - 75, 0, 45], [30, P, 30], undefined, 'cyl');
    b.decor('Опора регулируемая', 'black', [45, 0, S2 - 75], [30, P, 30], undefined, 'cyl');
    b.decor('Опора регулируемая', 'black', [px - 36, 0, pz - 36], [30, P, 30], undefined, 'cyl');
    b.add('leg', 6);
  }
  if (wall) b.add('hanger', 2);

  const zoneTop = P + t;
  const zoneH = H - t - zoneTop;
  const nShelves = hasSink ? 0 : sec.shelves;
  for (let k = 1; k <= nShelves; k++) {
    const y = zoneTop + (k * zoneH) / (nShelves + 1) - t / 2;
    b.box('Полка (боковое крыло)', 'corpus', [t, y, BK], [D - t - 18, t, S2 - t - BK], S2 - t - BK);
    b.box('Полка (основное крыло)', 'corpus', [D - 18, y, BK], [S1 - t - D + 18, t, D - BK - 18], S1 - t - D);
    b.add('pin', 8);
  }

  // Складной двухстворчатый фасад «гармошка» (Blum Clip Top 170° + междверная петля 60°, плотный притвор 2 мм в углу без щели!)
  if (m.doorMode !== 'none' && sec.door && Hi > 100) {
    const y0 = P + 2;
    const hd = H - 2 - y0;
    // Первая створка перекрывает торец в углу (от D + 1 до S1 - 1.5)
    const xStart = D + 1;
    const dw1 = Math.max(100, (S1 - 1.5) - xStart);
    const a1: PartAnim = { type: 'door', key: `${m.id}-door-c1`, pivot: [S1 - 1.5, D], ang: 85 };
    b.box('Фасад гармошка (створка 1)', 'facade', [xStart, y0, D], [dw1, hd, FACADE_T], 2 * (dw1 + hd), a1);
    b.add('hinge', hingesFor(hd));
    // Одна эргономичная ручка на ведущей створке гармошки (исключает соударение ручек в углу!)
    doorHandle(b, m, a1, xStart, S1 - 1.5, y0, y0 + hd, 'right', D + FACADE_T);

    // Вторая створка примыкает с зазором 2 мм к тыльной плоскости первой створки (от D + FACADE_T + 2 до S2 - 1.5)
    const zStart = D + FACADE_T + 2;
    const dw2 = Math.max(100, (S2 - 1.5) - zStart);
    const a2: PartAnim = { type: 'door', key: `${m.id}-door-c2`, pivot: [D, S2 - 1.5], ang: -85 };
    b.box('Фасад гармошка (створка 2)', 'facade', [D, y0, zStart], [FACADE_T, hd, dw2], 2 * (dw2 + hd), a2);
    b.add('hinge', hingesFor(hd));
  }

  if (m.countertop && m.kind === 'corner') {
    const topOut = D + 30;
    b.box('Столешница Г-образная (часть 1)', 'top', [0, H, 0], [S1, COUNTERTOP_T, topOut], S1);
    b.box('Столешница Г-образная (часть 2)', 'top', [0, H, topOut], [topOut, COUNTERTOP_T, Math.max(20, S2 - topOut)], topOut);
    b.decor('Пристенный бортик (осн.)', 'top', [0, H + COUNTERTOP_T, 0], [S1, 24, 16]);
    b.decor('Пристенный бортик (бок.)', 'top', [0, H + COUNTERTOP_T, 16], [16, 24, S2 - 16]);

    if (hasSink && S1 >= 800 && D >= 450) {
      const sw = Math.min(500, S1 - D + 140);
      const sd = Math.min(420, D - 100);
      const sx = Math.max(80, S1 - sw - 50);
      const sz = Math.round((D - sd) / 2) + 12;
      b.decor('Мойка врезная: бортик', 'metal', [sx, H + COUNTERTOP_T - 1, sz], [sw, 2, sd]);
      b.decor('Мойка врезная: чаша', 'black', [sx + 22, H + COUNTERTOP_T - 0.5, sz + 42], [sw - 44, 2.2, sd - 62]);
      b.decor('Смеситель: база', 'metal', [sx + sw / 2 - 18, H + COUNTERTOP_T, sz + 8], [36, 24, 30]);
    }
  }

  if (trimH > 0) {
    b.box('Верхняя планка (основное крыло)', 'facade', [D, H, D], [S1 - D, trimH, FACADE_T], 2 * (S1 - D + trimH));
    b.box('Верхняя планка (боковое крыло)', 'facade', [D, H, D + FACADE_T], [FACADE_T, trimH, Math.max(20, S2 - D - FACADE_T)], 2 * (S2 - D + trimH));
    b.add('confirmat', 6);
  }
}

export interface BuildModuleOptions {
  /** Пропустить индивидуальные куски цоколя, столешницы и верхнего карниза (заменяются цельными через buildContinuousSpans). */
  skipContinuous?: boolean;
}

export function buildModule(m: Module, opts?: BuildModuleOptions): BuiltModule {
  const b = new Builder();
  const corner = isCorner(m.kind);
  if (corner) cornerCabinet(b, m);
  else rectCabinet(b, m, opts?.skipContinuous === true);

  const W = m.w;
  if (m.mirror) {
    const visited = new Set<PartAnim>();
    for (const p of b.parts) {
      p.pos[0] = W - (p.pos[0] + p.size[0]);
      if (p.rotY !== undefined) p.rotY = -p.rotY;
      if (p.anim && !visited.has(p.anim)) {
        visited.add(p.anim);
        if (p.anim.pivot) p.anim.pivot = [W - p.anim.pivot[0], p.anim.pivot[1]];
        if (p.anim.ang !== undefined) p.anim.ang = -p.anim.ang;
        if (p.anim.travelX !== undefined) p.anim.travelX = -p.anim.travelX;
      }
    }
  }

  const topExtra = (m.countertop && (m.kind === 'base' || m.kind === 'corner') ? COUNTERTOP_T : 0)
    + (m.topTrim && m.topTrim > 0 && m.kind !== 'base' && m.kind !== 'corner' ? m.topTrim : 0);
  const cornerArmZ = corner ? Math.max(m.d + 180, m.cornerW2 ?? m.w) : m.d;
  return {
    parts: b.parts,
    hardware: b.hw,
    width: m.w,
    depth: cornerArmZ + FACADE_T,
    height: m.h + topExtra,
  };
}

export interface SpanPart {
  /** Деталь в мировых координатах сцены [x, y, z] */
  part: Part;
  /** Эталонный модуль для определения декора материала */
  refModule: Module;
  /** Название узла для карты раскроя и бирок */
  groupName: string;
  /** Идентификатор узла для карты раскроя */
  groupId: string;
}

function splitSpanLengths(totalW: number, maxSheetLen: number, split: boolean): number[] {
  if (!split || totalW <= maxSheetLen) return [totalW];
  const res: number[] = [];
  let rem = totalW;
  while (rem > maxSheetLen) {
    res.push(maxSheetLen);
    rem -= maxSheetLen;
  }
  if (rem > 0) res.push(rem);
  return res;
}

/**
 * Формирует цельные (единые на весь непрерывный ряд стоящих вплотную шкафов) детали на ВСЕХ стенах ('back', 'left', 'right')
 * с профессиональной угловой стыковкой 90° (еврозапил столешницы, замкнутый контур цоколя без щелей, единый карниз):
 * 1) Цельный нижний цоколь на клипсах к регулируемым ножкам (+ крайние торцевые возвраты только на свободных краях),
 * 2) Цельная столешница 38 мм без швов между тумбами + пристенный бортик,
 * 3) Профиль LED-подсветки рабочей зоны,
 * 4) Цельная верхняя доборная планка (карниз под потолок) над верхним рядом и пеналами.
 */
export function buildContinuousSpans(modules: Module[], splitForCutlist = false, roomW = 4500): SpanPart[] {
  const spans: SpanPart[] = [];
  const BK = BACK_T;
  const WALLS: ('back' | 'left' | 'right')[] = ['back', 'left', 'right'];

  /** Преобразует локальный бокс ряда стены (вдоль оси стены u0..u0+uLen, по глубине от стены v0..v0+vLen) в мировые координаты [x, y, z] */
  const wallBox = (wall: 'back' | 'left' | 'right', u0: number, y0: number, v0: number, uLen: number, yLen: number, vLen: number): { pos: V3; size: V3 } => {
    if (wall === 'left') {
      return { pos: [v0, y0, u0], size: [vLen, yLen, uLen] };
    }
    if (wall === 'right') {
      return { pos: [roomW - (v0 + vLen), y0, u0], size: [vLen, yLen, uLen] };
    }
    return { pos: [u0, y0, v0], size: [uLen, yLen, vLen] };
  };

  // Наличие угловых модулей в левом и правом углах задней стены (для точного примыкания без лишних боковых цоколей)
  const leftCornerBase = modules.find((m) => (m.wall ?? 'back') === 'back' && m.kind === 'corner' && !m.mirror && m.x <= 20);
  const rightCornerBase = modules.find((m) => (m.wall ?? 'back') === 'back' && m.kind === 'corner' && m.mirror && Math.abs((m.x + m.w) - roomW) <= 30);
  const backBaseAtLeft = modules.find((m) => (m.wall ?? 'back') === 'back' && !isWall(m.kind) && !isCorner(m.kind) && m.x <= 20);
  const backBaseAtRight = modules.find((m) => (m.wall ?? 'back') === 'back' && !isWall(m.kind) && !isCorner(m.kind) && Math.abs((m.x + m.w) - roomW) <= 30);
  const leftBaseAtCorner = modules.find((m) => m.wall === 'left' && !isWall(m.kind) && m.x <= (backBaseAtLeft ? backBaseAtLeft.d + 110 : 20));
  const rightBaseAtCorner = modules.find((m) => m.wall === 'right' && !isWall(m.kind) && m.x <= (backBaseAtRight ? backBaseAtRight.d + 110 : 20));

  for (const wall of WALLS) {
    const wSuffix = wall === 'left' ? ' [Левое крыло]' : wall === 'right' ? ' [Правое крыло]' : '';

    // 1. Цельный нижний цоколь
    const plinthMods = modules
      .filter((m) => (m.wall ?? 'back') === wall && !isWall(m.kind) && !isCorner(m.kind) && (m.lift ?? 0) === 0 && m.plinth > 0)
      .sort((a, b) => a.x - b.x);

    const plinthRuns: Module[][] = [];
    for (const m of plinthMods) {
      const prevRun = plinthRuns[plinthRuns.length - 1];
      const prev = prevRun ? prevRun[prevRun.length - 1] : null;
      if (
        prev &&
        Math.abs((prev.x + prev.w) - m.x) <= 5 &&
        prev.plinth === m.plinth &&
        prev.d === m.d &&
        (prev.plinthColor ?? 'facade') === (m.plinthColor ?? 'facade')
      ) {
        prevRun.push(m);
      } else {
        plinthRuns.push([m]);
      }
    }

    for (const run of plinthRuns) {
      const first = run[0];
      const last = run[run.length - 1];
      const P = first.plinth;
      const D = first.d;
      const plinthZ = D - 50 - 16;
      const plinthMat: PartMat = first.plinthColor === 'black' ? 'black' : first.plinthColor === 'facade' ? 'facade' : 'corpus';

      let uStart = first.x;
      let uEnd = last.x + last.w;
      let skipStartReturn = false;
      let skipEndReturn = false;

      // Замыкание 90° угла цоколя без щелей и без пересечений
      if (wall === 'back') {
        if (leftCornerBase && Math.abs(first.x - leftCornerBase.w) <= 10) skipStartReturn = true;
        else if (first.x <= 20 && leftBaseAtCorner) {
          uStart = Math.max(0, leftBaseAtCorner.d - 66);
          skipStartReturn = true;
        }
        if (rightCornerBase && Math.abs((last.x + last.w) - rightCornerBase.x) <= 10) skipEndReturn = true;
        else if (Math.abs((last.x + last.w) - roomW) <= 30 && rightBaseAtCorner) {
          uEnd = Math.min(uEnd, roomW - Math.max(0, rightBaseAtCorner.d - 66));
          skipEndReturn = true;
        }
      } else if (wall === 'left') {
        const armZ = leftCornerBase ? (leftCornerBase.cornerW2 ?? leftCornerBase.w) : 0;
        if (leftCornerBase && Math.abs(first.x - armZ) <= 10) skipStartReturn = true;
        else if (backBaseAtLeft && first.x >= backBaseAtLeft.d - 5 && first.x <= backBaseAtLeft.d + 110) {
          uStart = Math.max(0, backBaseAtLeft.d - 50);
          skipStartReturn = true;
        }
      } else if (wall === 'right') {
        const armZ = rightCornerBase ? (rightCornerBase.cornerW2 ?? rightCornerBase.w) : 0;
        if (rightCornerBase && Math.abs(first.x - armZ) <= 10) skipStartReturn = true;
        else if (backBaseAtRight && first.x >= backBaseAtRight.d - 5 && first.x <= backBaseAtRight.d + 110) {
          uStart = Math.max(0, backBaseAtRight.d - 50);
          skipEndReturn = false;
        }
      }

      const totalW = Math.max(40, Math.round(uEnd - uStart));
      const isMulti = run.length > 1;
      const groupName = (isMulti ? `Общий цоколь (${run.length} мод.)` : first.name) + wSuffix;
      const groupId = isMulti ? `span-plinth-${wall}-${first.id}` : first.id;
      const frontName = isMulti ? 'Цоколь цельный (на клипсах)' : 'Цоколь';

      let curU = uStart;
      for (const segW of splitSpanLengths(totalW, 2750, splitForCutlist)) {
        const wb = wallBox(wall, curU, 0, plinthZ, segW, P, 16);
        spans.push({
          refModule: first,
          groupName,
          groupId,
          part: { name: frontName, mat: plinthMat, pos: wb.pos, size: wb.size, edgeMm: segW, sheet: true, shape: 'box' },
        });
        curU += segW;
      }

      const sidePlinthDepth = plinthZ - BK;
      if (sidePlinthDepth > 50 && totalW > 120) {
        if (!skipStartReturn && first.x > 25) {
          const wbL = wallBox(wall, uStart, 0, BK, 16, P, sidePlinthDepth);
          spans.push({
            refModule: first, groupName, groupId,
            part: { name: 'Цоколь боковой L', mat: plinthMat, pos: wbL.pos, size: wbL.size, edgeMm: sidePlinthDepth, sheet: true, shape: 'box' },
          });
        }
        if (!skipEndReturn) {
          const wbR = wallBox(wall, uEnd - 16, 0, BK, 16, P, sidePlinthDepth);
          spans.push({
            refModule: last, groupName, groupId,
            part: { name: 'Цоколь боковой R', mat: plinthMat, pos: wbR.pos, size: wbR.size, edgeMm: sidePlinthDepth, sheet: true, shape: 'box' },
          });
        }
      }
    }

    // 2. Цельная столешница 38 мм над рядом нижних тумб (с еврозапилом в углу 90°)
    const topMods = modules
      .filter((m) => (m.wall ?? 'back') === wall && m.kind === 'base' && !isCorner(m.kind) && m.countertop)
      .sort((a, b) => a.x - b.x);

    const topRuns: Module[][] = [];
    for (const m of topMods) {
      const prevRun = topRuns[topRuns.length - 1];
      const prev = prevRun ? prevRun[prevRun.length - 1] : null;
      if (
        prev &&
        Math.abs((prev.x + prev.w) - m.x) <= 5 &&
        (prev.lift ?? 0) + prev.h === (m.lift ?? 0) + m.h &&
        prev.d === m.d &&
        prev.matTop === m.matTop
      ) {
        prevRun.push(m);
      } else {
        topRuns.push([m]);
      }
    }

    for (const run of topRuns) {
      const first = run[0];
      const last = run[run.length - 1];
      const H = (first.lift ?? 0) + first.h;
      const D = first.d;

      let uStart = first.x;
      const uEnd = last.x + last.w;

      // Еврозапил столешницы в 90° углу: боковое крыло дотягивается ровно до переднего свеса задней столешницы (D_back + 30)
      if (wall === 'left' && backBaseAtLeft && backBaseAtLeft.countertop && first.x >= backBaseAtLeft.d - 5 && first.x <= backBaseAtLeft.d + 110) {
        uStart = backBaseAtLeft.d + 30;
      } else if (wall === 'right' && backBaseAtRight && backBaseAtRight.countertop && first.x >= backBaseAtRight.d - 5 && first.x <= backBaseAtRight.d + 110) {
        uStart = backBaseAtRight.d + 30;
      }

      const totalW = Math.max(40, Math.round(uEnd - uStart));
      const isMulti = run.length > 1;
      const groupName = (isMulti ? `Единая столешница (${run.length} мод.)` : first.name) + wSuffix;
      const groupId = isMulti ? `span-top-${wall}-${first.id}` : first.id;
      const partName = isMulti ? 'Столешница цельная' : 'Столешница';

      let curU = uStart;
      const maxSlabLen = first.matTop === 'top-white-matt' ? 4200 : 3050;
      for (const segW of splitSpanLengths(totalW, maxSlabLen, splitForCutlist)) {
        const wbTop = wallBox(wall, curU, H, 0, segW, COUNTERTOP_T, D + 30);
        spans.push({
          refModule: first, groupName, groupId,
          part: { name: partName, mat: 'top', pos: wbTop.pos, size: wbTop.size, edgeMm: segW, sheet: true, shape: 'box' },
        });
        const wbSplash = wallBox(wall, curU, H + COUNTERTOP_T, 0, segW, 24, 16);
        spans.push({
          refModule: first, groupName, groupId,
          part: { name: 'Пристенный бортик столешницы', mat: 'top', pos: wbSplash.pos, size: wbSplash.size, edgeMm: 0, sheet: false, shape: 'box' },
        });
        curU += segW;
      }
    }

    // 3. Профиль LED-подсветки рабочей зоны
    const wallMods = modules
      .filter((m) => (m.wall ?? 'back') === wall && m.kind === 'wall' && !isCorner(m.kind) && (m.lift ?? 0) >= 1200 && (m.lift ?? 0) <= 1750)
      .sort((a, b) => a.x - b.x);
    const wallRuns: Module[][] = [];
    for (const m of wallMods) {
      const prevRun = wallRuns[wallRuns.length - 1];
      const prev = prevRun ? prevRun[prevRun.length - 1] : null;
      if (
        prev &&
        Math.abs((prev.x + prev.w) - m.x) <= 5 &&
        Math.abs((prev.lift ?? 0) - (m.lift ?? 0)) <= 2 &&
        prev.d === m.d
      ) {
        prevRun.push(m);
      } else {
        wallRuns.push([m]);
      }
    }
    for (const run of wallRuns) {
      const first = run[0];
      const last = run[run.length - 1];
      const totalW = Math.round((last.x + last.w) - first.x);
      const botY = first.lift ?? 0;
      if (botY >= 1000 && totalW >= 300) {
        const zLed = Math.max(40, first.d - 75);
        const wbHousing = wallBox(wall, first.x + 8, botY - 4, zLed, totalW - 16, 4, 18);
        const wbDiffuser = wallBox(wall, first.x + 10, botY - 6.5, zLed + 3, totalW - 20, 3, 12);
        spans.push({
          refModule: first,
          groupName: (run.length > 1 ? `LED-профиль (${run.length} мод.)` : first.name) + wSuffix,
          groupId: `span-led-${wall}-${first.id}`,
          part: { name: 'Алюминиевый профиль LED-подсветки', mat: 'metal', pos: wbHousing.pos, size: wbHousing.size, edgeMm: 0, sheet: false, shape: 'box' },
        });
        spans.push({
          refModule: first,
          groupName: (run.length > 1 ? `LED-профиль (${run.length} мод.)` : first.name) + wSuffix,
          groupId: `span-led-glow-${wall}-${first.id}`,
          part: { name: 'Светодиодная лента рабочей зоны', mat: 'led-warm', pos: wbDiffuser.pos, size: wbDiffuser.size, edgeMm: 0, sheet: false, shape: 'box' },
        });
      }
    }

    // 4. Цельная верхняя доборная планка / карниз под потолок
    const trimMods = modules
      .filter((m) => (m.wall ?? 'back') === wall && !isCorner(m.kind) && m.kind !== 'base' && (m.topTrim ?? 0) > 0)
      .sort((a, b) => a.x - b.x);

    const trimRuns: Module[][] = [];
    for (const m of trimMods) {
      const prevRun = trimRuns[trimRuns.length - 1];
      const prev = prevRun ? prevRun[prevRun.length - 1] : null;
      if (
        prev &&
        Math.abs((prev.x + prev.w) - m.x) <= 5 &&
        Math.abs(((prev.lift ?? 0) + prev.h) - ((m.lift ?? 0) + m.h)) <= 2 &&
        prev.topTrim === m.topTrim &&
        prev.d === m.d &&
        prev.matFacade === m.matFacade
      ) {
        prevRun.push(m);
      } else {
        trimRuns.push([m]);
      }
    }

    for (let ri = 0; ri < trimRuns.length; ri++) {
      const run = trimRuns[ri];
      const first = run[0];
      const last = run[run.length - 1];
      const topY = (first.lift ?? 0) + first.h;
      const trimH = first.topTrim!;
      const D = first.d;

      let uStart = first.x;
      const uEnd = last.x + last.w;
      if (wall === 'left' || wall === 'right') {
        const backUpperAtCorner = modules.find(
          (o) =>
            (o.wall ?? 'back') === 'back' &&
            (o.topTrim ?? 0) > 0 &&
            Math.abs(((o.lift ?? 0) + o.h) - topY) <= 5 &&
            (wall === 'left' ? o.x <= 25 : Math.abs((o.x + o.w) - roomW) <= 35),
        );
        if (backUpperAtCorner && first.x >= backUpperAtCorner.d - 5 && first.x <= backUpperAtCorner.d + 110) {
          uStart = backUpperAtCorner.d + FACADE_T;
        }
      }

      const totalW = Math.max(40, Math.round(uEnd - uStart));
      const isMulti = run.length > 1;
      const groupName = (isMulti ? `Верхний карниз (${run.length} мод.)` : first.name) + wSuffix;
      const groupId = isMulti ? `span-trim-${wall}-${first.id}` : first.id;
      const partName = isMulti ? 'Верхняя планка (карниз цельный)' : 'Верхняя планка (карниз)';

      let curU = uStart;
      for (const segW of splitSpanLengths(totalW, 2750, splitForCutlist)) {
        const wbTrim = wallBox(wall, curU, topY, D, segW, trimH, FACADE_T);
        spans.push({
          refModule: first, groupName, groupId,
          part: { name: partName, mat: 'facade', pos: wbTrim.pos, size: wbTrim.size, edgeMm: 2 * (segW + trimH), sheet: true, shape: 'box' },
        });
        curU += segW;
      }

      // Боковые возвраты карниза только на открытых торцах (где модуль не упирается в стену/угол)
      const prevRun = ri > 0 ? trimRuns[ri - 1] : undefined;
      const leftJoin = prevRun && Math.abs((prevRun[prevRun.length - 1].x + prevRun[prevRun.length - 1].w) - first.x) <= 5;
      if (!leftJoin && D > 50 && first.x > 400) {
        const wbRetL = wallBox(wall, uStart, topY, 0, FACADE_T, trimH, D);
        spans.push({
          refModule: first, groupName, groupId,
          part: { name: 'Верхняя планка боковая L', mat: 'facade', pos: wbRetL.pos, size: wbRetL.size, edgeMm: 2 * (D + trimH), sheet: true, shape: 'box' },
        });
      } else if (leftJoin && prevRun && D > prevRun[0].d + 20) {
        const dDiff = D - prevRun[0].d;
        const wbStepL = wallBox(wall, uStart, topY, prevRun[0].d, FACADE_T, trimH, dDiff);
        spans.push({
          refModule: first, groupName, groupId,
          part: { name: 'Боковой возврат верхней планки', mat: 'facade', pos: wbStepL.pos, size: wbStepL.size, edgeMm: 2 * (dDiff + trimH), sheet: true, shape: 'box' },
        });
      }

      const nextRun = trimRuns[ri + 1];
      const rightJoin = nextRun && Math.abs((last.x + last.w) - nextRun[0].x) <= 5;
      const maxSpanForWall = wall === 'back' ? roomW : 99999;
      if (!rightJoin && D > 50 && uEnd < maxSpanForWall - 25) {
        const wbRetR = wallBox(wall, uEnd - FACADE_T, topY, 0, FACADE_T, trimH, D);
        spans.push({
          refModule: last, groupName, groupId,
          part: { name: 'Верхняя планка боковая R', mat: 'facade', pos: wbRetR.pos, size: wbRetR.size, edgeMm: 2 * (D + trimH), sheet: true, shape: 'box' },
        });
      } else if (rightJoin && nextRun && D > nextRun[0].d + 20) {
        const dDiff = D - nextRun[0].d;
        const wbStepR = wallBox(wall, uEnd - FACADE_T, topY, nextRun[0].d, FACADE_T, trimH, dDiff);
        spans.push({
          refModule: last, groupName, groupId,
          part: { name: 'Боковой возврат верхней планки', mat: 'facade', pos: wbStepR.pos, size: wbStepR.size, edgeMm: 2 * (dDiff + trimH), sheet: true, shape: 'box' },
        });
      }
    }
  }

  return spans;
}

export const FOOTPRINT_W = (m: Module) => m.w;
