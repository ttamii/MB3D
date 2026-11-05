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
    name: string, mat: PartMat, pos: V3, size: V3, edgeMm = 0, anim?: PartAnim, sheet = true,
  ): void {
    this.parts.push({
      name, mat, pos: [...pos], size: [...size], edgeMm, sheet, shape: 'box', ...(anim ? { anim } : {}),
    });
  }

  decor(name: string, mat: PartMat, pos: V3, size: V3, anim?: PartAnim, shape: 'box' | 'cyl' = 'box'): void {
    this.parts.push({
      name, mat, pos: [...pos], size: [...size], edgeMm: 0, sheet: false, shape, ...(anim ? { anim } : {}),
    });
  }
}

export const hingesFor = (h: number) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5);

/** Ручка-скоба на двери (визуально + учёт в фурнитуре). */
function doorHandle(
  b: Builder, m: Module, anim: PartAnim, x0: number, x1: number, y0: number, y1: number,
  hinge: 'left' | 'right' | 'top', zFront: number,
): void {
  if (!m.handles) return;
  if (hinge === 'top') {
    const hw = Math.max(90, Math.min(240, (x1 - x0) * 0.35));
    b.decor('Ручка', 'handle', [(x0 + x1 - hw) / 2, y0 + 24, zFront], [hw, 14, 22], anim);
    b.add('handle');
    return;
  }
  const hl = Math.max(100, Math.min(320, (y1 - y0) * 0.25));
  const hx = hinge === 'left' ? x1 - 38 : x0 + 24;
  let y: number;
  if (isWall(m.kind)) y = y0 + 30;
  else if (m.kind === 'base' || m.kind === 'corner') y = y1 - 30 - hl;
  else y = Math.max(y0 + 20, Math.min(y1 - hl - 20, 1000 - hl / 2));
  b.decor('Ручка', 'handle', [hx, y, zFront], [14, hl, 22], anim);
  b.add('handle');
}

export function isDoubleDoorSection(m: Module, segW: number): boolean {
  if (m.hinge === 'top') return false;
  if (segW > 620) return true;
  if (segW >= 540 && /сушк|двухдвер|посуд|2\s*ств|2\s*двер/i.test(m.name)) return true;
  return false;
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

  if (milling === 'frame') {
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
      b.box('Цоколь', plinthMat, [0, 0, plinthZ], [W, P, 16], W);
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
      ? (isFullHeight ? fullHeight / nd : Math.min(m.drawerH, fullHeight / nd))
      : 0;
    const zoneTop = nd > 0 ? P + Math.round(nd * fhStep) : P + t;

    // сегмент фасада по центру перегородок
    const segL = i === 0 ? 0 : x0 - t / 2;
    const segR = i === n - 1 ? W : x0 + cw + t / 2;
    const fx0 = segL + (i === 0 ? 1 : 1.5);
    const fx1 = segR - (i === n - 1 ? 1 : 1.5);

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

        b.box(`${lbl}: бок`, 'corpus', [x0 + 13, yk + 30, zs], [16, boxH, rail], 0, anim);
        b.box(`${lbl}: бок`, 'corpus', [x0 + cw - 13 - 16, yk + 30, zs], [16, boxH, rail], 0, anim);
        b.box(`${lbl}: задняя`, 'corpus', [x0 + 13 + 16, yk + 30, zs], [boxW - 32, boxH, 16], 0, anim);
        b.box(`${lbl}: дно`, 'back', [x0 + 13 + 12, yk + 38, zs + 8], [boxW - 24, 4, rail - 16], 0, anim);
        b.add('rail');
        if (m.handles) {
          const hw = Math.min(220, (fx1 - fx0) * 0.5);
          b.decor('Ручка', 'handle', [(fx0 + fx1) / 2 - hw / 2, yk + fhBox - 38, zFront + FACADE_T], [hw, 14, 22], anim);
          b.add('handle');
        }
      }

      // Если над ящиками есть полки или штанга, ставим разделительный горизонт
      if (!isFullHeight && (sec.shelves > 0 || (sec.rods ?? 0) > 0 || sec.rod)) {
        b.box('Горизонт над ящиками', 'corpus', [x0, zoneTop, BK], [cw, t, D - BK - 20], cw);
        b.add('confirmat', 4);
      }
    }

    // полки и штанги
    const zTop = H - t;
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
      const zoneH = zTop - zoneTop;
      const isDishDryer = isWall(m.kind) && /сушк/i.test(m.name) && sec.shelves >= 2 && D >= 240;
      if (isDishDryer) {
        const yTray = zoneTop + 35;
        const yPlates = zoneTop + Math.round(zoneH * 0.28);
        const yCups = zoneTop + Math.round(zoneH * 0.62);
        b.decor('Поддон сушки (нерж.)', 'metal', [x0 + 4, yTray, BK + 12], [cw - 8, 6, D - BK - 32]);
        b.decor('Сушилка хромированная (тарелки)', 'metal', [x0 + 2, yPlates, BK + 10], [cw - 4, 14, D - BK - 28]);
        b.decor('Сушилка хромированная (чашки)', 'metal', [x0 + 2, yCups, BK + 10], [cw - 4, 12, D - BK - 28]);
        b.add('pin', 8);
      } else {
        for (let k = 1; k <= sec.shelves; k++) {
          const y = zoneTop + (k * zoneH) / (sec.shelves + 1) - t / 2;
          b.box('Полка', 'corpus', [x0, y, BK], [cw, t, D - BK - 20], cw);
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
      const y0 = nd > 0 ? P + 2 + Math.round(nd * fhStep) : P + 2;
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
                desired = m.hinge === 'right' ? 'right' : 'left';
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
      b.box('Столешница', 'top', [0, H, 0], [W, COUNTERTOP_T, D + 30], W);
    }
    // Врезная мойка на тумбе под мойку
    if (isSink && W >= 400 && D >= 450) {
      const sw = Math.min(580, W - 90);
      const sd = Math.min(430, D - 110);
      const sx = Math.round((W - sw) / 2);
      const sz = Math.round((D - sd) / 2) + 10;
      b.decor('Мойка врезная: бортик', 'metal', [sx, H + COUNTERTOP_T - 1, sz], [sw, 2, sd]);
      b.decor('Мойка врезная: чаша', 'black', [sx + 22, H + COUNTERTOP_T - 0.5, sz + 44], [sw - 44, 2, sd - 64]);
      b.decor('Мойка: сливной клапан', 'metal', [W / 2 - 22, H + COUNTERTOP_T, sz + sd / 2], [44, 2, 44], undefined, 'cyl');
      b.decor('Смеситель: база', 'metal', [W / 2 - 18, H + COUNTERTOP_T, sz + 8], [36, 2, 30]);
    }
    // Встроенная индукционная варочная панель над духовкой
    if (isOven && W >= 450 && D >= 450) {
      const cwTop = Math.min(560, W - 70);
      const cdTop = Math.min(460, D - 90);
      const cxTop = Math.round((W - cwTop) / 2);
      const czTop = Math.round((D - cdTop) / 2) + 10;
      b.decor('Варочная панель: стеклокерамика', 'black', [cxTop, H + COUNTERTOP_T - 0.5, czTop], [cwTop, 2, cdTop]);
      const rZone = Math.min(145, Math.floor(Math.min(cwTop, cdTop) * 0.34));
      b.decor('Варочная панель: конфорка 1', 'metal', [cxTop + 36, H + COUNTERTOP_T, czTop + 32], [rZone, 1.5, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 2', 'metal', [cxTop + cwTop - rZone - 36, H + COUNTERTOP_T, czTop + 32], [rZone, 1.5, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 3', 'metal', [cxTop + 36, H + COUNTERTOP_T, czTop + cdTop - rZone - 42], [rZone, 1.5, rZone], undefined, 'cyl');
      b.decor('Варочная панель: конфорка 4', 'metal', [cxTop + cwTop - rZone - 36, H + COUNTERTOP_T, czTop + cdTop - rZone - 42], [rZone, 1.5, rZone], undefined, 'cyl');
    }
  }

  if (trimH > 0) {
    if (!skipContinuous) {
      b.box('Верхняя планка (карниз)', 'facade', [0, H, D], [W, trimH, FACADE_T], 2 * (W + trimH));
      if (D >= 120 && W >= 2 * t + 40) {
        b.box('Монтажная планка карниза', 'corpus', [t, H, Math.max(BK, D - 80)], [W - 2 * t, trimH, t], W - 2 * t);
      }
    }
    b.add('confirmat', 4);
  }
}

function cornerCabinet(b: Builder, m: Module): void {
  const { w: S, h: H, d: D, t } = m;
  const wall = isWall(m.kind);
  const P = wall ? 0 : m.plinth;
  const bodyH = H - P;
  const BK = BACK_T;
  const sec = m.sections[0];
  const Hi = H - P - 2 * t;
  const trimH = m.topTrim && m.topTrim > 0 && m.kind === 'cornerWall' ? m.topTrim : 0;

  b.box('Боковина (у стены)', 'corpus', [0, P, BK], [t, bodyH, S - BK], bodyH);
  b.box('Боковина внутренняя 1', 'corpus', [D - t, P, D - t], [t, bodyH, S - D + t], bodyH);
  b.box('Боковина внутренняя 2', 'corpus', [D, P, D - t], [S - D, bodyH, t], bodyH);
  b.box('Дно (плечо 1)', 'corpus', [t, P, BK], [D - 2 * t, t, S - BK], D - 2 * t);
  b.box('Дно (плечо 2)', 'corpus', [D - t, P, BK], [S - D + t, t, D - t - BK], D - t - BK);
  b.box('Крышка (плечо 1)', 'corpus', [t, H - t, BK], [D - 2 * t, t, S - BK], D - 2 * t);
  b.box('Крышка (плечо 2)', 'corpus', [D - t, H - t, BK], [S - D + t, t, D - t - BK], D - t - BK);
  b.box('Задняя стенка', 'back', [1, P + 1, 0], [S - 2, bodyH - 2, BK], 0);
  b.add('confirmat', 16);

  if (P > 0) {
    const plinthMat: PartMat = m.plinthColor === 'black' ? 'black' : m.plinthColor === 'facade' ? 'facade' : 'corpus';
    b.box('Цоколь (плечо 1)', plinthMat, [0, 0, S - 50 - 16], [D, P, 16], D);
    b.box('Цоколь (плечо 2)', plinthMat, [S - 50 - 16, 0, BK], [16, P, D - BK], D - BK);
    b.add('leg', 6);
  }
  if (wall) b.add('hanger', 2);

  const zoneTop = P + t;
  const zoneH = H - t - zoneTop;
  for (let k = 1; k <= sec.shelves; k++) {
    const y = zoneTop + (k * zoneH) / (sec.shelves + 1) - t / 2;
    b.box('Полка (плечо 1)', 'corpus', [t, y, BK], [D - 2 * t, t, S - BK - 20], D - 2 * t);
    b.box('Полка (плечо 2)', 'corpus', [D - t, y, BK], [S - D + t - 20, t, D - t - BK], D - t - BK);
    b.add('pin', 8);
  }

  if (m.doorMode !== 'none' && sec.door && Hi > 100) {
    const y0 = P + 2;
    const hd = H - 2 - y0;
    const a1: PartAnim = { type: 'door', key: `${m.id}-door-c1`, pivot: [1, S], ang: -85 };
    b.box('Фасад (плечо 1)', 'facade', [1, y0, S], [D - 2, hd, FACADE_T], 2 * (D - 2 + hd), a1);
    b.add('hinge', hingesFor(hd));
    doorHandle(b, m, a1, 1, D - 1, y0, y0 + hd, 'left', S + FACADE_T);

    const a2: PartAnim = { type: 'door', key: `${m.id}-door-c2`, pivot: [S, 1], ang: 85 };
    b.box('Фасад (плечо 2)', 'facade', [S, y0, 1], [FACADE_T, hd, D - 2], 2 * (D - 2 + hd), a2);
    b.add('hinge', hingesFor(hd));
    if (m.handles) {
      const hl = Math.max(100, Math.min(320, hd * 0.25));
      const y = wall ? y0 + 30 : y0 + hd - 30 - hl;
      b.decor('Ручка', 'handle', [S + FACADE_T, y, D - 38], [22, hl, 14], a2);
      b.add('handle');
    }
  }

  if (m.countertop && m.kind === 'corner') {
    b.box('Столешница (часть 1)', 'top', [0, H, 0], [S + 30, COUNTERTOP_T, D + 30], S + 30);
    b.box('Столешница (часть 2)', 'top', [0, H, D + 30], [D + 30, COUNTERTOP_T, S - D], D + 30);
  }

  if (trimH > 0) {
    b.box('Верхняя планка (плечо 1)', 'facade', [0, H, S], [D, trimH, FACADE_T], 2 * (D + trimH));
    b.box('Верхняя планка (плечо 2)', 'facade', [S, H, 0], [FACADE_T, trimH, D], 2 * (D + trimH));
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
  return {
    parts: b.parts,
    hardware: b.hw,
    width: corner ? m.w + 30 : m.w,
    depth: (corner ? m.w : m.d) + FACADE_T,
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
 * Формирует цельные (единые на весь непрерывный ряд стоящих вплотную шкафов) детали:
 * 1) Цельный нижний цоколь на клипсах к регулируемым ножкам (+ крайние торцевые возвраты),
 * 2) Цельная столешница 38 мм без швов между тумбами,
 * 3) Цельная верхняя доборная планка (карниз под потолок) над верхним рядом и пеналами.
 */
export function buildContinuousSpans(modules: Module[], splitForCutlist = false): SpanPart[] {
  const spans: SpanPart[] = [];
  const BK = BACK_T;

  // 1. Цельный нижний цоколь (напольные не-угловые модули)
  const plinthMods = modules
    .filter((m) => !isWall(m.kind) && !isCorner(m.kind) && (m.lift ?? 0) === 0 && m.plinth > 0)
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
    const totalW = Math.round((last.x + last.w) - first.x);
    const P = first.plinth;
    const D = first.d;
    const plinthZ = D - 50 - 16;
    const plinthMat: PartMat = first.plinthColor === 'black' ? 'black' : first.plinthColor === 'facade' ? 'facade' : 'corpus';
    const isMulti = run.length > 1;
    const groupName = isMulti ? `Общий цоколь (${run.length} мод.)` : first.name;
    const groupId = isMulti ? `span-plinth-${first.id}` : first.id;
    const frontName = isMulti ? 'Цоколь цельный (на клипсах)' : 'Цоколь';

    let curX = first.x;
    for (const segW of splitSpanLengths(totalW, 2750, splitForCutlist)) {
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: frontName,
          mat: plinthMat,
          pos: [curX, 0, plinthZ],
          size: [segW, P, 16],
          edgeMm: segW,
          sheet: true,
          shape: 'box',
        },
      });
      curX += segW;
    }

    const sidePlinthDepth = plinthZ - BK;
    if (sidePlinthDepth > 50 && totalW > 120) {
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: 'Цоколь боковой L',
          mat: plinthMat,
          pos: [first.x, 0, BK],
          size: [16, P, sidePlinthDepth],
          edgeMm: sidePlinthDepth,
          sheet: true,
          shape: 'box',
        },
      });
      spans.push({
        refModule: last,
        groupName,
        groupId,
        part: {
          name: 'Цоколь боковой R',
          mat: plinthMat,
          pos: [last.x + last.w - 16, 0, BK],
          size: [16, P, sidePlinthDepth],
          edgeMm: sidePlinthDepth,
          sheet: true,
          shape: 'box',
        },
      });
    }
  }

  // 2. Цельная столешница 38 мм над рядом нижних тумб
  const topMods = modules
    .filter((m) => m.kind === 'base' && !isCorner(m.kind) && m.countertop)
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
    const totalW = Math.round((last.x + last.w) - first.x);
    const H = (first.lift ?? 0) + first.h;
    const D = first.d;
    const isMulti = run.length > 1;
    const groupName = isMulti ? `Единая столешница (${run.length} мод.)` : first.name;
    const groupId = isMulti ? `span-top-${first.id}` : first.id;
    const partName = isMulti ? 'Столешница цельная' : 'Столешница';

    let curX = first.x;
    for (const segW of splitSpanLengths(totalW, 3050, splitForCutlist)) {
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: partName,
          mat: 'top',
          pos: [curX, H, 0],
          size: [segW, COUNTERTOP_T, D + 30],
          edgeMm: segW,
          sheet: true,
          shape: 'box',
        },
      });
      // Пристенный бортик (плинтус столешницы) у стены
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: 'Пристенный бортик столешницы',
          mat: 'top',
          pos: [curX, H + COUNTERTOP_T, 0],
          size: [segW, 24, 16],
          edgeMm: 0,
          sheet: false,
          shape: 'box',
        },
      });
      curX += segW;
    }
  }

  // 2б. Профиль LED-подсветки рабочей зоны под верхними шкафами
  const wallMods = modules
    .filter((m) => m.kind === 'wall' && !isCorner(m.kind))
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
      spans.push({
        refModule: first,
        groupName: run.length > 1 ? `LED-профиль (${run.length} мод.)` : first.name,
        groupId: `span-led-${first.id}`,
        part: {
          name: 'Профиль LED-подсветки рабочей зоны',
          mat: 'metal',
          pos: [first.x + 8, botY - 5, Math.max(40, first.d - 65)],
          size: [totalW - 16, 5, 16],
          edgeMm: 0,
          sheet: false,
          shape: 'box',
        },
      });
    }
  }

  // 3. Цельная верхняя доборная планка / карниз под потолок
  const trimMods = modules
    .filter((m) => !isCorner(m.kind) && m.kind !== 'base' && (m.topTrim ?? 0) > 0)
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
    const totalW = Math.round((last.x + last.w) - first.x);
    const topY = (first.lift ?? 0) + first.h;
    const trimH = first.topTrim!;
    const D = first.d;
    const t = first.t || 16;
    const isMulti = run.length > 1;
    const groupName = isMulti ? `Верхний карниз (${run.length} мод.)` : first.name;
    const groupId = isMulti ? `span-trim-${first.id}` : first.id;
    const partName = isMulti ? 'Верхняя планка (карниз цельный)' : 'Верхняя планка (карниз)';

    let curX = first.x;
    for (const segW of splitSpanLengths(totalW, 2750, splitForCutlist)) {
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: partName,
          mat: 'facade',
          pos: [curX, topY, D],
          size: [segW, trimH, FACADE_T],
          edgeMm: 2 * (segW + trimH),
          sheet: true,
          shape: 'box',
        },
      });
      if (D >= 120 && segW >= 2 * t + 40) {
        spans.push({
          refModule: first,
          groupName,
          groupId,
          part: {
            name: 'Монтажная планка карниза',
            mat: 'corpus',
            pos: [curX + t, topY, Math.max(BK, D - 80)],
            size: [segW - 2 * t, trimH, t],
            edgeMm: segW - 2 * t,
            sheet: true,
            shape: 'box',
          },
        });
      }
      curX += segW;
    }

    // Боковые планки карниза по внешнему периметру (до задней стены z=0) и при перепаде глубины
    const prevRun = ri > 0 ? trimRuns[ri - 1] : undefined;
    const leftJoin = prevRun && Math.abs((prevRun[prevRun.length - 1].x + prevRun[prevRun.length - 1].w) - first.x) <= 5;
    if (!leftJoin && D > 50) {
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: 'Верхняя планка боковая L',
          mat: 'facade',
          pos: [first.x, topY, 0],
          size: [FACADE_T, trimH, D],
          edgeMm: 2 * (D + trimH),
          sheet: true,
          shape: 'box',
        },
      });
    } else if (leftJoin && prevRun && D > prevRun[0].d + 20) {
      const dDiff = D - prevRun[0].d;
      spans.push({
        refModule: first,
        groupName,
        groupId,
        part: {
          name: 'Боковой возврат верхней планки',
          mat: 'facade',
          pos: [first.x, topY, prevRun[0].d],
          size: [FACADE_T, trimH, dDiff],
          edgeMm: 2 * (dDiff + trimH),
          sheet: true,
          shape: 'box',
        },
      });
    }

    const nextRun = trimRuns[ri + 1];
    const rightJoin = nextRun && Math.abs((last.x + last.w) - nextRun[0].x) <= 5;
    if (!rightJoin && D > 50) {
      spans.push({
        refModule: last,
        groupName,
        groupId,
        part: {
          name: 'Верхняя планка боковая R',
          mat: 'facade',
          pos: [last.x + last.w - FACADE_T, topY, 0],
          size: [FACADE_T, trimH, D],
          edgeMm: 2 * (D + trimH),
          sheet: true,
          shape: 'box',
        },
      });
    } else if (rightJoin && nextRun && D > nextRun[0].d + 20) {
      const dDiff = D - nextRun[0].d;
      spans.push({
        refModule: last,
        groupName,
        groupId,
        part: {
          name: 'Боковой возврат верхней планки',
          mat: 'facade',
          pos: [last.x + last.w - FACADE_T, topY, nextRun[0].d],
          size: [FACADE_T, trimH, dDiff],
          edgeMm: 2 * (dDiff + trimH),
          sheet: true,
          shape: 'box',
        },
      });
    }
  }

  return spans;
}

export const FOOTPRINT_W = (m: Module) => m.w;
