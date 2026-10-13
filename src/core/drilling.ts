import { hingesFor } from './geometry';
import type { Module, Part } from './types';

export interface Hole {
  x: number;
  y: number;
  diam: number;
  depth?: number;
  type: 'confirmat' | 'hinge-cup' | 'hinge-plate' | 'shelf-pin' | 'drawer-rail' | 'handle';
  desc: string;
}

export interface DetailedPart {
  posIndex: number;
  name: string;
  part: Part;
  l: number;
  w: number;
  t: number;
  qty: number;
  edgeLabel: string; // e.g. "══ / ──"
  holes: Hole[];
}

export interface FacadeDrilling {
  name: string;
  w: number;
  h: number;
  t: number;
  hingeSide: 'left' | 'right';
  hingeCups: { y: number; x: number; diam: number; depth: number }[];
  handleHoles?: { x: number; y1: number; y2: number; dist: number };
  dimChainY: number[];
}

export interface SidePanelDrilling {
  name: string;
  h: number;
  d: number;
  t: number;
  side: 'left' | 'right';
  holes: Hole[];
}

export interface ModuleDrilling {
  module: Module;
  parts: DetailedPart[];
  facades: FacadeDrilling[];
  sides: SidePanelDrilling[];
}

/**
 * Рассчитывает точную карту присадки отверстий, фурнитуры и деталировки для модуля.
 */
export function computeModuleDrilling(m: Module, builtParts: Part[]): ModuleDrilling {
  const { w: W, h: H, d: D, t, plinth } = m;
  const isWallMod = m.kind === 'wall' || m.kind === 'cornerWall';
  const P = isWallMod ? 0 : plinth;

  // 1. Нумерация деталей (позиции ①..Ⓝ)
  const sheetParts = builtParts.filter((p) => p.sheet);
  const partMap = new Map<string, { part: Part; qty: number }>();
  for (const p of sheetParts) {
    const key = `${p.name}_${p.size[0]}_${p.size[1]}_${p.size[2]}`;
    const cur = partMap.get(key);
    if (cur) cur.qty += 1;
    else partMap.set(key, { part: p, qty: 1 });
  }

  let posCounter = 1;
  const detailedParts: DetailedPart[] = [];
  for (const [, { part, qty }] of partMap) {
    const [sx, sy, sz] = part.size;
    const l = Math.max(sx, sy);
    const w = Math.min(sx, sy);
    const th = sz;

    // Условное обозначение кромки
    // Две длинные стороны или одна длинная
    const edgeLabel = part.edgeMm >= 2 * (l + w) * 0.8 ? 'Кругом 4 ст.' : part.edgeMm >= 2 * l ? '2 длинные ст.' : part.edgeMm > 0 ? '1 длинная ст.' : 'Без кромки';

    detailedParts.push({
      posIndex: posCounter++,
      name: part.name,
      part,
      l: Math.round(l),
      w: Math.round(w),
      t: Math.round(th),
      qty,
      edgeLabel,
      holes: [],
    });
  }

  // 2. Расчёт присадки фасадов (чашки петель Ø35 мм и ручки)
  const facades: FacadeDrilling[] = [];
  const nSec = m.sections.length;
  const n = nSec;
  const Wi = W - 2 * t;
  const cw = (Wi - (n - 1) * t) / n;
  const cellX = (i: number) => t + i * (cw + t);

  m.sections.forEach((s, i) => {
    if (m.doorMode !== 'hinged' || !s.door) return;
    const nd = s.drawers;
    const fh = nd > 0 ? Math.min(m.drawerH, Math.floor((H - P - 2 * t - 60) / nd)) : 0;
    const y0 = nd > 0 ? P + 2 + nd * fh : P + 2;
    const y1 = H - 2;
    const doorH = y1 - y0;
    if (doorH < 100) return;

    const x0 = cellX(i);
    const segL = i === 0 ? 0 : x0 - t / 2;
    const segR = i === n - 1 ? W : x0 + cw + t / 2;
    const fx0 = segL + (i === 0 ? 1 : 1.5);
    const fx1 = segR - (i === n - 1 ? 1 : 1.5);
    const segW = fx1 - fx0;

    const nDoors = segW > 620 ? 2 : 1;
    const gap = 3;
    const doorW = (segW - gap * (nDoors - 1)) / nDoors;

    for (let k = 0; k < nDoors; k++) {
      const hingeSide: 'left' | 'right' = nDoors === 1 ? 'left' : k === 0 ? 'left' : 'right';
      const numHinges = hingesFor(doorH);
      const edgeDist = 21.5; // стандарт до центра чашки Ø35 мм

      const cups: { y: number; x: number; diam: number; depth: number }[] = [];
      const dimChainY: number[] = [];

      const topBottomMargin = 100;
      if (numHinges === 2) {
        cups.push({ y: topBottomMargin, x: edgeDist, diam: 35, depth: 11.5 });
        cups.push({ y: doorH - topBottomMargin, x: edgeDist, diam: 35, depth: 11.5 });
        dimChainY.push(topBottomMargin, doorH - 2 * topBottomMargin, topBottomMargin);
      } else {
        const step = (doorH - 2 * topBottomMargin) / (numHinges - 1);
        for (let hIdx = 0; hIdx < numHinges; hIdx++) {
          cups.push({ y: Math.round(topBottomMargin + hIdx * step), x: edgeDist, diam: 35, depth: 11.5 });
        }
        dimChainY.push(topBottomMargin);
        for (let hIdx = 0; hIdx < numHinges - 1; hIdx++) dimChainY.push(Math.round(step));
        dimChainY.push(topBottomMargin);
      }

      // Ручка (если есть)
      let handleHoles: FacadeDrilling['handleHoles'] | undefined;
      if (m.handles) {
        const hOffsetEdge = doorW - 38;
        const handleCenterY = isWallMod ? 80 : m.kind === 'base' ? doorH - 80 : Math.min(doorH / 2, 1000);
        handleHoles = {
          x: hingeSide === 'left' ? hOffsetEdge : 38,
          y1: Math.round(handleCenterY - 64),
          y2: Math.round(handleCenterY + 64),
          dist: 128,
        };
      }

      facades.push({
        name: nDoors > 1 ? `Фасад секции ${i + 1} (${k === 0 ? 'лев.' : 'прав.'})` : `Фасад секции ${i + 1}`,
        w: Math.round(doorW),
        h: Math.round(doorH),
        t: 16,
        hingeSide,
        hingeCups: cups,
        handleHoles,
        dimChainY,
      });
    }
  });

  // 3. Расчёт сверловки боковин (конфирматы дна/крышки, планки петель, полки)
  const sides: SidePanelDrilling[] = [];
  const sideH = H - P;
  const sideD = D - 4; // минус задняя стенка

  ['left', 'right'].forEach((side) => {
    const isL = side === 'left';
    const holes: Hole[] = [];

    // Конфирматы крепления Дна (сквозные Ø7 мм с зенковкой)
    const yBottom = Math.round(t / 2);
    holes.push(
      { x: 50, y: yBottom, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат крепления дна (задний)' },
      { x: sideD - 50, y: yBottom, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат крепления дна (передний)' },
    );
    if (sideD > 500) {
      holes.push({ x: Math.round(sideD / 2), y: yBottom, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат дна (центр)' });
    }

    // Конфирматы крепления Крышки
    const yTop = Math.round(sideH - t / 2);
    holes.push(
      { x: 50, y: yTop, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат крепления крышки (задний)' },
      { x: sideD - 50, y: yTop, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат крепления крышки (передний)' },
    );
    if (sideD > 500) {
      holes.push({ x: Math.round(sideD / 2), y: yTop, diam: 7, depth: 16, type: 'confirmat', desc: 'Конфирмат крышки (центр)' });
    }

    // Отверстия под ответные планки петель (отступ 37 мм от переднего края, шаг 32 мм)
    const targetSection = isL ? m.sections[0] : m.sections[m.sections.length - 1];
    if (m.doorMode === 'hinged' && targetSection?.door) {
      const doorH = sideH - 4;
      const numHinges = hingesFor(doorH);
      const topBottom = 100;
      const xPlate = sideD - 37;

      for (let hIdx = 0; hIdx < numHinges; hIdx++) {
        const step = (doorH - 2 * topBottom) / (numHinges - 1);
        const yCenter = Math.round(topBottom + hIdx * step);
        holes.push(
          { x: xPlate, y: yCenter - 16, diam: 5, depth: 12, type: 'hinge-plate', desc: `Планка петли ${hIdx + 1} (винт 1)` },
          { x: xPlate, y: yCenter + 16, diam: 5, depth: 12, type: 'hinge-plate', desc: `Планка петли ${hIdx + 1} (винт 2)` },
        );
      }
    }

    // Отверстия под полкодержатели (Ø5 мм, глубина 10 мм)
    const shelvesCount = targetSection?.shelves ?? 0;
    if (shelvesCount > 0) {
      const zoneTop = sideH - t;
      const zoneBottom = t;
      const zoneH = zoneTop - zoneBottom;
      for (let k = 1; k <= shelvesCount; k++) {
        const yShelf = Math.round(zoneBottom + (k * zoneH) / (shelvesCount + 1));
        holes.push(
          { x: 50, y: yShelf, diam: 5, depth: 10, type: 'shelf-pin', desc: `Полкодержатель полки ${k} (задний)` },
          { x: sideD - 37, y: yShelf, diam: 5, depth: 10, type: 'shelf-pin', desc: `Полкодержатель полки ${k} (передний)` },
        );
      }
    }

    // Отверстия под направляющие ящиков
    const drawersCount = targetSection?.drawers ?? 0;
    if (drawersCount > 0) {
      const fh = Math.min(m.drawerH, Math.floor((sideH - 2 * t - 60) / drawersCount));
      for (let k = 0; k < drawersCount; k++) {
        const yRail = Math.round(t + 10 + k * fh + 35);
        holes.push(
          { x: sideD - 37, y: yRail, diam: 5, depth: 10, type: 'drawer-rail', desc: `Направляющая ящика ${k + 1} (отв. 1)` },
          { x: sideD - 37 - 192, y: yRail, diam: 5, depth: 10, type: 'drawer-rail', desc: `Направляющая ящика ${k + 1} (отв. 2)` },
        );
      }
    }

    sides.push({
      name: isL ? 'Боковина левая' : 'Боковина правая',
      h: sideH,
      d: sideD,
      t,
      side: isL ? 'left' : 'right',
      holes,
    });
  });

  return { module: m, parts: detailedParts, facades, sides };
}
