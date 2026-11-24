import type { Module } from './types';
import { isCorner, isWall } from './defaults';
import { buildModule } from './geometry';

/** Пересекаются ли два модуля по высоте (без учёта стены): ярус, подъём от пола, высота. */
export function verticalOverlap(a: Module, b: Module): boolean {
  const aY0 = a.lift ?? 0;
  const aY1 = aY0 + a.h;
  const bY0 = b.lift ?? 0;
  const bY1 = bY0 + b.h;
  return Math.min(aY1, bY1) - Math.max(aY0, bY0) > 15;
}

/** Проверяет, перекрываются ли два модуля по вертикали (на одной и той же стене, по ярусу). */
export function modulesOverlapY(a: Module, b: Module): boolean {
  if ((a.wall ?? 'back') !== (b.wall ?? 'back')) return false;
  return verticalOverlap(a, b);
}

/** Реальная физическая ширина модуля вдоль его стены. */
export function getModuleW(m: Module): number {
  return buildModule(m).width;
}

/**
 * Рассчитывает занятую угловую зону в начале (minStart) и в конце (maxEndOffset) стены
 * из-за модулей, стоящих в этом же ярусе на перпендикулярной стене:
 * - Г-образный / трапециевидный угол (900×900 / 600×600) занимает ровно длину бокового крыла (cornerW2 ?? w).
 * - Прямой угловой модуль с глухой зоной и L-блендой занимает глубину D + blindFillerW (чтобы двери не бились).
 * - Обычный шкаф в углу занимает свою глубину D.
 */
export function getCornerClearanceForWall(
  modules: Module[],
  wall: 'back' | 'left' | 'right',
  y0: number,
  y1: number,
  roomW = 4500,
  ignoreId?: string,
): { minStart: number; maxEndOffset: number } {
  let minStart = 0;
  let maxEndOffset = 0;

  const overlapsY = (o: Module) => {
    if (o.id === ignoreId) return false;
    const oy0 = o.lift ?? 0;
    const oy1 = oy0 + o.h;
    return Math.min(oy1, y1) - Math.max(oy0, y0) > 15;
  };

  if (wall === 'left') {
    for (const b of modules) {
      if ((b.wall ?? 'back') !== 'back' || !overlapsY(b)) continue;
      if (isCorner(b.kind) && !b.mirror && b.x <= 35) {
        minStart = Math.max(minStart, b.cornerW2 ?? b.w);
      } else if (!isCorner(b.kind) && b.x <= 35) {
        const extra = b.blindSide === 'left' ? (b.blindFillerW ?? (isWall(b.kind) ? 40 : 45)) : 0;
        minStart = Math.max(minStart, b.d + extra);
      }
    }
  } else if (wall === 'right') {
    for (const b of modules) {
      if ((b.wall ?? 'back') !== 'back' || !overlapsY(b)) continue;
      if (isCorner(b.kind) && b.mirror && Math.abs((b.x + b.w) - roomW) <= 45) {
        minStart = Math.max(minStart, b.cornerW2 ?? b.w);
      } else if (!isCorner(b.kind) && Math.abs((b.x + b.w) - roomW) <= 45) {
        const extra = b.blindSide === 'right' ? (b.blindFillerW ?? (isWall(b.kind) ? 40 : 45)) : 0;
        minStart = Math.max(minStart, b.d + extra);
      }
    }
  } else {
    // Для задней стены: если боковая стена сама заходит до самого угла (x <= 25), учитываем её глубину
    for (const s of modules) {
      if (!overlapsY(s)) continue;
      if (s.wall === 'left' && s.x <= 25) {
        const extra = s.blindSide === 'right' ? (s.blindFillerW ?? (isWall(s.kind) ? 40 : 45)) : 0;
        minStart = Math.max(minStart, s.d + extra);
      } else if (s.wall === 'right' && s.x <= 25) {
        const extra = s.blindSide === 'left' ? (s.blindFillerW ?? (isWall(s.kind) ? 40 : 45)) : 0;
        maxEndOffset = Math.max(maxEndOffset, s.d + extra);
      }
    }
  }

  return { minStart, maxEndOffset };
}

/**
 * Автоматически подгоняет ширину глухой угловой зоны (blindW) под фактическую глубину шкафа
 * на перпендикулярной стене + ширину угловой L-бленды (чтобы бленда никогда не утопала и не торчала).
 */
export function autoFitBlindZone(modules: Module[], targetId: string, roomW = 4500): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target || !target.blindSide) return;
  const wall = target.wall ?? 'back';
  const fillerW = target.blindFillerW ?? (isWall(target.kind) ? 40 : 45);
  let perpDepth = isWall(target.kind) ? 300 : target.d;

  if (wall === 'back') {
    const perpWall = target.blindSide === 'left' ? 'left' : 'right';
    const perpMod = modules.find((o) => o.wall === perpWall && verticalOverlap(o, target));
    if (perpMod) perpDepth = perpMod.d;
  } else {
    const perpMod = modules.find(
      (o) =>
        (o.wall ?? 'back') === 'back' &&
        verticalOverlap(o, target) &&
        (wall === 'left' ? o.x <= 50 : Math.abs((o.x + o.w) - roomW) <= 60),
    );
    if (perpMod) perpDepth = perpMod.d;
  }

  const idealBlindW = perpDepth + fillerW;
  target.blindFillerW = fillerW;
  target.blindW = idealBlindW;
  if (target.w < idealBlindW + 250) {
    target.w = idealBlindW + (isWall(target.kind) ? 400 : 450);
  }
}

/**
 * Изменяет ширину целевого модуля с каскадным сдвигом соседей:
 * При увеличении ширины (например, добора с 50 до 100 мм) все примыкающие и расположенные
 * справа модули того же яруса автоматически сдвигаются вправо, исключая пересечение («заход в текстуру»).
 * При уменьшении ширины модули, примыкавшие встык, подтягиваются обратно влево, не образуя щелей.
 */
export function resizeModuleCascading(
  modules: Module[],
  targetId: string,
  newW: number,
  roomW?: number
): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  const oldW = target.w;
  if (oldW === newW) return;
  const delta = newW - oldW;
  target.w = newW;

  // Все модули на том же ярусе (пересекающиеся по Y) справа от целевого
  const rightChain = modules
    .filter((m) => m.id !== target.id && modulesOverlapY(m, target) && m.x >= target.x)
    .sort((a, b) => a.x - b.x);

  if (delta > 0) {
    // Раздвижка вправо: если сосед примыкал встык или на него наползает новая ширина
    let barrier = target.x + newW;
    for (const neighbor of rightChain) {
      const wasAttached = Math.abs(neighbor.x - (barrier - delta)) <= 8;
      if (wasAttached || neighbor.x < barrier) {
        const shift = wasAttached ? delta : (barrier - neighbor.x);
        neighbor.x = Math.max(neighbor.x + shift, barrier);
        barrier = neighbor.x + getModuleW(neighbor);
      } else {
        barrier = neighbor.x + getModuleW(neighbor);
      }
    }
  } else {
    // Сужение влево: модули, стоявшие встык, подтягиваются влево, сохраняя шов
    let currentEdge = target.x + newW;
    for (const neighbor of rightChain) {
      const wasAttached = Math.abs(neighbor.x - (currentEdge - delta)) <= 8;
      if (wasAttached) {
        neighbor.x = Math.max(target.x + newW, neighbor.x + delta);
        currentEdge = neighbor.x + getModuleW(neighbor);
      } else {
        break;
      }
    }
  }

  // Защита от выхода за границу правой стены
  if (roomW && roomW > 0) {
    const overflow = Math.max(
      0,
      ...modules.filter((m) => modulesOverlapY(m, target)).map((m) => m.x + getModuleW(m) - roomW)
    );
    if (overflow > 0) {
      target.w = Math.max(30, newW - overflow);
      let barrier = target.x + target.w;
      for (const neighbor of rightChain) {
        if (neighbor.x < barrier) {
          neighbor.x = barrier;
        }
        barrier = neighbor.x + getModuleW(neighbor);
      }
    }
  }
}

/**
 * Перемещает модуль вдоль стены с каскадным расталкиванием соседей при движении вправо
 * и запретом захода внутрь левого соседа при движении влево.
 */
export function shiftModuleCascading(
  modules: Module[],
  targetId: string,
  newX: number,
  wallSpan?: number,
  roomW = 4500
): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  const oldX = target.x;
  if (oldX === newX) return;
  const delta = newX - oldX;
  const targetW = getModuleW(target);
  const wall = target.wall ?? 'back';
  const { minStart, maxEndOffset } = getCornerClearanceForWall(modules, wall, target.lift ?? 0, (target.lift ?? 0) + target.h, roomW, target.id);
  const sameTier = modules.filter((m) => m.id !== target.id && modulesOverlapY(m, target));

  if (delta > 0) {
    target.x = Math.max(minStart, newX);
    let barrier = target.x + targetW;
    const rightChain = sameTier.filter((m) => m.x >= oldX).sort((a, b) => a.x - b.x);
    for (const neighbor of rightChain) {
      const wasAttached = Math.abs(neighbor.x - (barrier - delta)) <= 8;
      if (wasAttached || neighbor.x < barrier) {
        const shift = wasAttached ? delta : (barrier - neighbor.x);
        neighbor.x = Math.max(neighbor.x + shift, barrier);
        barrier = neighbor.x + getModuleW(neighbor);
      }
    }
  } else {
    const leftObstacles = sameTier.filter((m) => m.x + getModuleW(m) <= oldX + 8);
    const maxLeftX = leftObstacles.length > 0 ? Math.max(...leftObstacles.map((m) => m.x + getModuleW(m))) : minStart;
    target.x = Math.max(Math.max(minStart, maxLeftX), newX);
  }

  if (target.x < minStart) target.x = minStart;
  const effSpan = wallSpan && wallSpan > 0 ? wallSpan - maxEndOffset : 0;
  if (effSpan > 0 && target.x + targetW > effSpan) {
    target.x = Math.max(minStart, effSpan - targetW);
  }
}

/**
 * Ограничение перемещения при 3D-перетаскивании мышью:
 * Не позволяет модулю проникать внутрь соседних шкафов того же яруса, в угловые модули перпендикулярной стены или сквозь стены.
 */
export function preventDragCollision(
  modules: Module[],
  draggingId: string,
  rawX: number,
  startModuleX: number,
  wallSpan?: number,
  roomW = 4500
): number {
  const curMod = modules.find((m) => m.id === draggingId);
  if (!curMod) return rawX;
  const curW = getModuleW(curMod);
  const wall = curMod.wall ?? 'back';
  const { minStart, maxEndOffset } = getCornerClearanceForWall(
    modules,
    wall,
    curMod.lift ?? 0,
    (curMod.lift ?? 0) + curMod.h,
    roomW,
    curMod.id,
  );

  let x = rawX;
  const maxSpan = wallSpan && wallSpan > 0 ? wallSpan - maxEndOffset : 999999;

  // 1. Границы стены и углового примыкания
  if (x < minStart) x = minStart;
  if (wallSpan && wallSpan > 0 && x + curW > maxSpan) {
    x = Math.max(minStart, maxSpan - curW);
  }

  // 2. Препятствия того же яруса на этой же стене
  const sameTier = modules.filter((m) => m.id !== curMod.id && modulesOverlapY(m, curMod));

  const leftNeighbors = sameTier.filter((m) => m.x + getModuleW(m) <= startModuleX + 8);
  const rightNeighbors = sameTier.filter((m) => m.x >= startModuleX + curW - 8);

  const leftBarrier = leftNeighbors.length > 0 ? Math.max(...leftNeighbors.map((m) => m.x + getModuleW(m))) : minStart;
  const rightBarrier = rightNeighbors.length > 0 ? Math.min(...rightNeighbors.map((m) => m.x)) : maxSpan;

  const minAllowedX = Math.max(minStart, leftBarrier);
  const maxAllowedX = Math.max(minAllowedX, rightBarrier - curW);

  // Магнитная стыковка к углу и к соседним шкафам (в пределах 45 мм)
  const snapDist = 45;
  if (Math.abs(x - minAllowedX) <= snapDist) {
    x = minAllowedX;
  } else if (Math.abs(x - maxAllowedX) <= snapDist) {
    x = maxAllowedX;
  }

  return Math.max(minAllowedX, Math.min(x, maxAllowedX));
}

/**
 * Вставка доборной фальшпланки со сдвигом (строго в пределах текущей стены модуля!).
 */
export function insertFillerWithShift(
  modules: Module[],
  side: 'left' | 'right',
  referenceModule: Module,
  filler: Module,
  wallSpan?: number,
  roomW = 4500
): void {
  const targetWall = referenceModule.wall ?? 'back';
  if (targetWall === 'back') delete filler.wall;
  else filler.wall = targetWall;

  const refW = getModuleW(referenceModule);
  const fillerW = getModuleW(filler);
  const { minStart } = getCornerClearanceForWall(
    modules,
    targetWall,
    referenceModule.lift ?? 0,
    (referenceModule.lift ?? 0) + referenceModule.h,
    roomW,
  );
  const sameTier = modules.filter((m) => modulesOverlapY(m, referenceModule));

  if (side === 'left') {
    const insertX = referenceModule.x <= minStart + fillerW ? minStart : referenceModule.x - fillerW;
    filler.x = insertX;
    for (const m of sameTier) {
      if (m.x >= insertX) {
        m.x += fillerW;
      }
    }
  } else {
    const insertX = referenceModule.x + refW;
    filler.x = insertX;
    for (const m of sameTier) {
      if (m.x >= insertX) {
        m.x += fillerW;
      }
    }
  }

  modules.push(filler);

  // Коррекция правой границы ТОЛЬКО на той же стене
  const sameWallMods = modules.filter((m) => (m.wall ?? 'back') === targetWall);
  if (wallSpan && wallSpan > 0 && sameWallMods.length > 0) {
    const maxRight = Math.max(...sameWallMods.map((m) => m.x + getModuleW(m)));
    if (maxRight > wallSpan) {
      const overflow = maxRight - wallSpan;
      const minLeft = Math.min(...sameWallMods.map((m) => m.x));
      if (minLeft - minStart >= overflow) {
        for (const m of sameWallMods) {
          m.x -= overflow;
        }
      }
    }
  }
}

/** Автоматическое устранение любых пересечений между модулями на каждой стене с учётом углов. */
export function resolveAllOverlaps(modules: Module[], roomW = 4500): boolean {
  let changed = false;
  for (const wall of ['back', 'left', 'right'] as const) {
    const wallMods = modules.filter((m) => (m.wall ?? 'back') === wall).sort((a, b) => a.x - b.x);
    for (let i = 0; i < wallMods.length; i++) {
      const cur = wallMods[i];
      const { minStart } = getCornerClearanceForWall(modules, wall, cur.lift ?? 0, (cur.lift ?? 0) + cur.h, roomW, cur.id);
      if (cur.x < minStart) {
        cur.x = minStart;
        changed = true;
      }
      const curW = getModuleW(cur);
      for (let j = i + 1; j < wallMods.length; j++) {
        const next = wallMods[j];
        if (modulesOverlapY(cur, next) && next.x < cur.x + curW) {
          next.x = cur.x + curW;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Изменяет высоту модуля и автоматически сдвигает по вертикали (lift) антресоли,
 * стоящие непосредственно на его крышке НА ТОЙ ЖЕ СТЕНЕ, чтобы исключить наложение ярусов.
 */
export function resizeHeightWithStack(modules: Module[], targetId: string, newH: number): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  const oldH = target.h;
  const oldTop = (target.lift ?? 0) + oldH;
  target.h = newH;
  const newTop = (target.lift ?? 0) + newH;
  const targetWall = target.wall ?? 'back';

  for (const m of modules) {
    if (m.id === target.id || (m.wall ?? 'back') !== targetWall) continue;
    const xOverlap = m.x < target.x + getModuleW(target) - 5 && m.x + getModuleW(m) > target.x + 5;
    if (xOverlap && Math.abs((m.lift ?? 0) - oldTop) <= 40) {
      m.lift = newTop;
    }
  }
}

export function isSameVerticalTier(a: Module, b: Module): boolean {
  if (a.kind !== b.kind) return false;
  const aLift = a.lift ?? 0;
  const bLift = b.lift ?? 0;
  if (a.kind === 'wall' || a.kind === 'cornerWall') {
    const aIsMezz = aLift >= 1900 || a.name.toLowerCase().includes('антресоль');
    const bIsMezz = bLift >= 1900 || b.name.toLowerCase().includes('антресоль');
    return aIsMezz === bIsMezz;
  }
  return Math.abs(aLift - bLift) <= 150;
}

/**
 * Выравнивает высоту всех шкафов текущего яруса (например, всех антресолей или всех верхних шкафов)
 * под высоту выбранного модуля и подгоняет высоту пенала под общую верхнюю линию.
 */
export function syncTierHeight(modules: Module[], targetId: string): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  const sameTier = modules.filter((m) => m.id !== target.id && isSameVerticalTier(m, target));
  for (const m of sameTier) {
    resizeHeightWithStack(modules, m.id, target.h);
  }
  // Если выравниваем верхний ряд или антресоли — выравниваем пенал под самый верхний край кухни
  const maxWallTop = Math.max(
    0,
    ...modules.filter((m) => m.kind === 'wall' || m.kind === 'cornerWall').map((m) => (m.lift ?? 0) + m.h)
  );
  if (maxWallTop >= 2000) {
    for (const m of modules) {
      if (m.kind === 'tall' && !(/холодильник/i.test(m.name) && (!/встроен/i.test(m.name) || /невстроен/i.test(m.name)))) {
        m.h = maxWallTop;
      }
    }
  }
}

/**
 * Выравнивает глубину всех шкафов текущего яруса (например, всех антресолей под глубину верхних шкафов 300 мм).
 */
export function syncTierDepth(modules: Module[], targetId: string): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  for (const m of modules) {
    if (m.id !== target.id && isSameVerticalTier(m, target)) {
      m.d = target.d;
      if (m.blindSide && (m.blindW ?? 0) > 100) {
        m.blindW = target.d + (m.blindFillerW ?? (isWall(m.kind) ? 40 : 45));
      }
    }
  }
  if (target.blindSide && (target.blindW ?? 0) > 100) {
    target.blindW = target.d + (target.blindFillerW ?? (isWall(target.kind) ? 40 : 45));
  }
}

/**
 * Устанавливает или убирает верхнюю доборную планку (карниз под потолок) сразу на всех
 * верхних шкафах/антресолях, пеналах и высоких шкафах, формирующих верхний контур гарнитура.
 */
export function applyTopTrimToUpperRow(modules: Module[], trimH: number): void {
  const cleanH = Math.max(0, Math.min(250, Math.round(trimH)));
  for (const m of modules) {
    if (m.kind === 'base' || m.kind === 'corner') {
      delete m.topTrim;
      continue;
    }
    const mW = getModuleW(m);
    const mTop = (m.lift ?? 0) + m.h;
    const mWall = m.wall ?? 'back';
    const hasModuleAbove = modules.some(
      (o) =>
        o.id !== m.id &&
        (o.wall ?? 'back') === mWall &&
        o.x < m.x + mW - 5 &&
        o.x + getModuleW(o) > m.x + 5 &&
        (o.lift ?? 0) >= mTop - 20,
    );
    if (!hasModuleAbove && cleanH > 0) {
      m.topTrim = cleanH;
    } else {
      delete m.topTrim;
    }
  }
}

export function getActiveTopTrimH(modules: Module[]): number {
  for (const m of modules) {
    if (m.topTrim && m.topTrim > 0) return m.topTrim;
  }
  return 0;
}
