import type { CutRow } from './estimate';
import type { Material } from './types';

export interface SheetFormat {
  name: string;
  w: number; // длина листа, мм (например 2800)
  h: number; // ширина листа, мм (например 2070)
  margin: number; // опил кромки по периметру, мм (например 10)
  kerf: number; // толщина пропила пилы, мм (например 4)
}

export const DEFAULT_SHEET_FORMATS: SheetFormat[] = [
  { name: '2800 × 2070 мм (EGGER / Kronospan)', w: 2800, h: 2070, margin: 10, kerf: 4 },
  { name: '2750 × 1830 мм (Стандарт РФ/СНГ)', w: 2750, h: 1830, margin: 10, kerf: 4 },
];

export interface PlacedPart {
  row: CutRow;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  pieceIndex: number;
}

export interface SheetLayout {
  sheetIndex: number;
  matId: string;
  matName: string;
  format: SheetFormat;
  parts: PlacedPart[];
  usedAreaM2: number;
  sheetAreaM2: number;
  efficiencyPercent: number; // Коэффициент использования материала (КУМ)
}

export interface NestingResult {
  sheets: SheetLayout[];
  totalSheets: number;
  overallEfficiencyPercent: number;
  totalPartsCount: number;
}

interface ItemToPack {
  row: CutRow;
  l: number;
  w: number;
  pieceIndex: number;
  grain: boolean;
}

/**
 * Алгоритм 2D-гильотинного раскроя (Guillotine Shelf / Best-Fit)
 * с учётом пропила пилы, опила кромки листа и направления древесных волокон.
 */
export function computeNesting(
  cutRows: CutRow[],
  materials: Material[],
  format: SheetFormat = DEFAULT_SHEET_FORMATS[0],
): NestingResult {
  const matMap = new Map<string, Material>(materials.map((m) => [m.id, m]));

  // Разворачиваем позиции по штукам (qty)
  const itemsByMat = new Map<string, ItemToPack[]>();

  cutRows.forEach((row) => {
    const mat = matMap.get(row.matId);
    if (!mat || mat.kind === 'top') return; // столешницы кроятся отдельно погонными метрами

    const items = itemsByMat.get(row.matId) ?? [];
    const grain = Boolean(mat.grain);

    for (let q = 0; q < row.qty; q++) {
      items.push({
        row,
        l: Math.max(row.l, row.w),
        w: Math.min(row.l, row.w),
        pieceIndex: q + 1,
        grain,
      });
    }
    itemsByMat.set(row.matId, items);
  });

  const allSheets: SheetLayout[] = [];
  const usableW = format.w - format.margin * 2;
  const usableH = format.h - format.margin * 2;
  const kerf = format.kerf;

  for (const [matId, items] of itemsByMat) {
    const mat = matMap.get(matId);
    const matName = mat?.name ?? 'ЛДСП';

    // Сортируем детали по убыванию максимального размера, затем площади (First-Fit Decreasing)
    items.sort((a, b) => b.l - a.l || (b.l * b.w) - (a.l * a.w));

    const remaining = [...items];
    let sheetNumber = 1;

    while (remaining.length > 0) {
      const placed: PlacedPart[] = [];
      let curY = format.margin;

      // Пока лист не заполнен по высоте
      while (curY < format.margin + usableH && remaining.length > 0) {
        // Находим деталь для начала новой полки/полосы
        let shelfHeight = 0;
        let curX = format.margin;
        let placedOnShelf = false;

        for (let i = 0; i < remaining.length; i++) {
          const item = remaining[i];
          const canRotate = !item.grain;

          // Варианты ориентации
          const orientations = canRotate
            ? [{ w: item.l, h: item.w, rot: false }, { w: item.w, h: item.l, rot: true }]
            : [{ w: item.l, h: item.w, rot: false }];

          // Проверяем, помещается ли деталь на текущей полке
          for (const opt of orientations) {
            if (shelfHeight === 0) {
              // Первая деталь на новой полке
              if (curY + opt.h <= format.margin + usableH && curX + opt.w <= format.margin + usableW) {
                shelfHeight = opt.h;
                placed.push({
                  row: item.row,
                  x: curX,
                  y: curY,
                  w: opt.w,
                  h: opt.h,
                  rotated: opt.rot,
                  pieceIndex: item.pieceIndex,
                });
                curX += opt.w + kerf;
                remaining.splice(i, 1);
                placedOnShelf = true;
                break;
              }
            } else {
              // Последующие детали на этой же полке
              if (opt.h <= shelfHeight && curX + opt.w <= format.margin + usableW) {
                placed.push({
                  row: item.row,
                  x: curX,
                  y: curY,
                  w: opt.w,
                  h: opt.h,
                  rotated: opt.rot,
                  pieceIndex: item.pieceIndex,
                });
                curX += opt.w + kerf;
                remaining.splice(i, 1);
                placedOnShelf = true;
                i--; // скорректировать индекс после удаления
                break;
              }
            }
          }
        }

        if (!placedOnShelf) {
          // На текущую полку больше ничего не влезает, переходим к следующей
          if (shelfHeight === 0) break; // Деталь не влезла даже на пустую полку
          curY += shelfHeight + kerf;
        } else {
          curY += shelfHeight + kerf;
        }
      }

      if (placed.length === 0) {
        // Защита от бесконечного цикла (если деталь физически больше листа)
        const oversized = remaining.shift()!;
        placed.push({
          row: oversized.row,
          x: format.margin,
          y: format.margin,
          w: Math.min(oversized.l, usableW),
          h: Math.min(oversized.w, usableH),
          rotated: false,
          pieceIndex: oversized.pieceIndex,
        });
      }

      const usedAreaMm2 = placed.reduce((sum, p) => sum + p.w * p.h, 0);
      const sheetAreaMm2 = format.w * format.h;
      const efficiency = Math.round((usedAreaMm2 / sheetAreaMm2) * 1000) / 10;

      allSheets.push({
        sheetIndex: sheetNumber++,
        matId,
        matName,
        format,
        parts: placed,
        usedAreaM2: Math.round((usedAreaMm2 / 1e6) * 100) / 100,
        sheetAreaM2: Math.round((sheetAreaMm2 / 1e6) * 100) / 100,
        efficiencyPercent: efficiency,
      });
    }
  }

  const totalSheets = allSheets.length;
  const totalParts = allSheets.reduce((sum, s) => sum + s.parts.length, 0);
  const totalUsed = allSheets.reduce((sum, s) => sum + s.usedAreaM2, 0);
  const totalSheet = allSheets.reduce((sum, s) => sum + s.sheetAreaM2, 0);
  const overallEfficiency = totalSheet > 0 ? Math.round((totalUsed / totalSheet) * 1000) / 10 : 0;

  return {
    sheets: allSheets,
    totalSheets,
    overallEfficiencyPercent: overallEfficiency,
    totalPartsCount: totalParts,
  };
}

/**
 * Генерирует профессиональный векторный чертёж карты раскроя (SVG)
 * с контурами деталей, бирками, пропилами и кромкооблицовкой.
 */
export function renderSheetSvg(sheet: SheetLayout): string {
  const { format, parts } = sheet;
  const pad = 60;
  const viewBoxW = format.w + pad * 2;
  const viewBoxH = format.h + pad * 2;
  const sx0 = pad;
  const sy0 = pad;

  const partElements: string[] = [];

  parts.forEach((p, i) => {
    const px = sx0 + p.x;
    const py = sy0 + p.y;
    const isSmall = p.w < 200 || p.h < 100;
    const labelFontSize = isSmall ? 18 : 26;
    const subFontSize = isSmall ? 14 : 18;

    partElements.push(`
      <g class="nest-part" data-part="${p.row.name}">
        <!-- Тело детали -->
        <rect x="${px}" y="${py}" width="${p.w}" height="${p.h}"
          fill="#f8fafc" stroke="#334155" stroke-width="2.5" rx="2"/>
        
        <!-- Обозначение кромки (акцентная синяя линия вдоль детали) -->
        ${p.row.edgeMm > 0 ? `<rect x="${px + 2}" y="${py + 2}" width="${p.w - 4}" height="${p.h - 4}" fill="none" stroke="#0284c7" stroke-width="2" stroke-dasharray="8 4"/>` : ''}

        <!-- Номер и бирка -->
        <circle cx="${px + 24}" cy="${py + 24}" r="15" fill="#0284c7"/>
        <text x="${px + 24}" y="${py + 30}" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>

        <!-- Название детали -->
        <text x="${px + p.w / 2}" y="${py + p.h / 2 - (isSmall ? 0 : 8)}" font-family="Inter, sans-serif" font-size="${labelFontSize}" font-weight="700" fill="#0f172a" text-anchor="middle">
          ${p.row.name}
        </text>

        <!-- Размеры и модуль -->
        <text x="${px + p.w / 2}" y="${py + p.h / 2 + (isSmall ? 18 : 22)}" font-family="Inter, sans-serif" font-size="${subFontSize}" font-weight="600" fill="#64748b" text-anchor="middle">
          ${p.w} × ${p.h} мм · ${p.row.moduleName}
        </text>
      </g>
    `);
  });

  return `
    <svg viewBox="0 0 ${viewBoxW} ${viewBoxH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border-radius:8px; user-select:none;">
      <!-- Контур цельного листа ЛДСП -->
      <rect x="${sx0}" y="${sy0}" width="${format.w}" height="${format.h}" fill="#f1f5f9" stroke="#0f172a" stroke-width="3"/>

      <!-- Линия опила кромки (margin 10 мм) -->
      <rect x="${sx0 + format.margin}" y="${sy0 + format.margin}"
        width="${format.w - format.margin * 2}" height="${format.h - format.margin * 2}"
        fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 6"/>

      <!-- Детали на листе -->
      ${partElements.join('\n')}

      <!-- Габаритные размеры листа -->
      <text x="${sx0 + format.w / 2}" y="${sy0 - 20}" font-family="Inter, sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="middle">
        ДЛИНА ЛИСТА: ${format.w} мм (полезная ${format.w - format.margin * 2} мм)
      </text>
      <text x="${sx0 - 20}" y="${sy0 + format.h / 2}" font-family="Inter, sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="middle" transform="rotate(-90 ${sx0 - 20} ${sy0 + format.h / 2})">
        ШИРИНА ЛИСТА: ${format.h} мм
      </text>
    </svg>
  `;
}
