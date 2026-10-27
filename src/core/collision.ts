import type { Module } from './types';
import { buildModule } from './geometry';

/** Проверяет, перекрываются ли два модуля по вертикали (ярус, высота и подъем от пола). */
export function modulesOverlapY(a: Module, b: Module): boolean {
  const aY0 = a.lift ?? 0;
  const aY1 = aY0 + a.h;
  const bY0 = b.lift ?? 0;
  const bY1 = bY0 + b.h;
  return Math.min(aY1, bY1) - Math.max(aY0, bY0) > 15;
}

/** Реальная физическая ширина модуля (с учетом угловых элементов). */
export function getModuleW(m: Module): number {
  return buildModule(m).width;
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
  roomW?: number
): void {
  const target = modules.find((m) => m.id === targetId);
  if (!target) return;
  const oldX = target.x;
  if (oldX === newX) return;
  const delta = newX - oldX;
  const targetW = getModuleW(target);
  const sameTier = modules.filter((m) => m.id !== target.id && modulesOverlapY(m, target));

  if (delta > 0) {
    target.x = newX;
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
    const maxLeftX = leftObstacles.length > 0 ? Math.max(...leftObstacles.map((m) => m.x + getModuleW(m))) : 0;
    target.x = Math.max(maxLeftX, newX);
  }

  if (target.x < 0) target.x = 0;
  if (roomW && roomW > 0 && target.x + targetW > roomW) {
    target.x = Math.max(0, roomW - targetW);
  }
}

/**
 * Ограничение перемещения при 3D-перетаскивании мышью:
 * Не позволяет модулю проникать внутрь соседних шкафов того же яруса или сквозь стены.
 */
export function preventDragCollision(
  modules: Module[],
  draggingId: string,
  rawX: number,
  startModuleX: number,
  roomW?: number
): number {
  const curMod = modules.find((m) => m.id === draggingId);
  if (!curMod) return rawX;
  const curW = getModuleW(curMod);

  let x = rawX;

  // 1. Границы комнаты
  if (x < 0) x = 0;
  if (roomW && roomW > 0 && x + curW > roomW) {
    x = Math.max(0, roomW - curW);
  }

  // 2. Препятствия того же яруса (пересечение по высоте Y)
  const sameTier = modules.filter((m) => m.id !== curMod.id && modulesOverlapY(m, curMod));

  const leftNeighbors = sameTier.filter((m) => m.x + getModuleW(m) <= startModuleX + 8);
  const rightNeighbors = sameTier.filter((m) => m.x >= startModuleX + curW - 8);

  const leftBarrier = leftNeighbors.length > 0 ? Math.max(...leftNeighbors.map((m) => m.x + getModuleW(m))) : 0;
  const rightBarrier = rightNeighbors.length > 0 ? Math.min(...rightNeighbors.map((m) => m.x)) : (roomW ?? 999999);

  const minAllowedX = Math.max(0, leftBarrier);
  const maxAllowedX = Math.max(minAllowedX, rightBarrier - curW);

  // Магнитная стыковка к границам кармана (в пределах 45 мм)
  const snapDist = 45;
  if (Math.abs(x - minAllowedX) <= snapDist) {
    x = minAllowedX;
  } else if (Math.abs(x - maxAllowedX) <= snapDist) {
    x = maxAllowedX;
  }

  return Math.max(minAllowedX, Math.min(x, maxAllowedX));
}

/**
 * Вставка доборной фальшпланки со сдвигом:
 * При установке добора слева или справа все последующие модули сдвигаются на ширину добора,
 * предотвращая любые пересечения.
 */
export function insertFillerWithShift(
  modules: Module[],
  side: 'left' | 'right',
  referenceModule: Module,
  filler: Module,
  roomW?: number
): void {
  const refW = getModuleW(referenceModule);
  const fillerW = getModuleW(filler);
  const sameTier = modules.filter((m) => modulesOverlapY(m, referenceModule));

  if (side === 'left') {
    // Вставка слева от опорного модуля (например, у левой стены при x=0)
    const insertX = referenceModule.x <= fillerW ? 0 : referenceModule.x - fillerW;
    filler.x = insertX;

    // Все модули от точки вставки сдвигаем вправо на ширину добора
    for (const m of sameTier) {
      if (m.x >= insertX) {
        m.x += fillerW;
      }
    }
  } else {
    // Вставка справа от опорного модуля
    const insertX = referenceModule.x + refW;
    filler.x = insertX;

    for (const m of sameTier) {
      if (m.x >= insertX) {
        m.x += fillerW;
      }
    }
  }

  modules.push(filler);

  // Коррекция правой границы комнаты при необходимости
  if (roomW && roomW > 0) {
    const maxRight = Math.max(...modules.map((m) => m.x + getModuleW(m)));
    if (maxRight > roomW) {
      const overflow = maxRight - roomW;
      const minLeft = Math.min(...modules.map((m) => m.x));
      if (minLeft >= overflow) {
        for (const m of modules) {
          m.x -= overflow;
        }
      }
    }
  }
}

/** Автоматическое устранение любых пересечений между модулями на одном ярусе. */
export function resolveAllOverlaps(modules: Module[]): boolean {
  let changed = false;
  const sorted = [...modules].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const curW = getModuleW(cur);
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (modulesOverlapY(cur, next)) {
        if (next.x < cur.x + curW) {
          next.x = cur.x + curW;
          changed = true;
        }
      }
    }
  }
  return changed;
}
