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
  matSheetCount?: number;
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
    const matSheets: SheetLayout[] = [];
    let sheetNumber = 1;

    while (remaining.length > 0) {
      const placed: PlacedPart[] = [];
      let curY = format.margin;

      // Пока лист не заполнен по высоте
      while (curY < format.margin + usableH && remaining.length > 0) {
        let shelfHeight = 0;
        let curX = format.margin;
        let placedOnShelf = false;

        for (let i = 0; i < remaining.length; i++) {
          const item = remaining[i];
          const canRotate = !item.grain;

          const orientations = canRotate
            ? [{ w: item.l, h: item.w, rot: false }, { w: item.w, h: item.l, rot: true }]
            : [{ w: item.l, h: item.w, rot: false }];

          let placedCurrent = false;
          let colX = curX;
          let colW = 0;
          let colUsedH = 0;

          for (const opt of orientations) {
            if (shelfHeight === 0) {
              if (curY + opt.h <= format.margin + usableH && curX + opt.w <= format.margin + usableW) {
                shelfHeight = opt.h;
                colX = curX;
                colW = opt.w;
                colUsedH = opt.h;
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
                i--; // важно: не пропускать следующую деталь после удаления первой на полке
                placedOnShelf = true;
                placedCurrent = true;
                break;
              }
            } else {
              if (opt.h <= shelfHeight && curX + opt.w <= format.margin + usableW) {
                colX = curX;
                colW = opt.w;
                colUsedH = opt.h;
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
                i--;
                placedOnShelf = true;
                placedCurrent = true;
                break;
              }
            }
          }

          // Доуплотнение свободного кармана под деталью в пределах высоты текущей полки (2D Sub-Column Packing)
          if (placedCurrent && shelfHeight - colUsedH >= 60 + kerf) {
            let subY = curY + colUsedH + kerf;
            for (let j = 0; j < remaining.length; j++) {
              const sub = remaining[j];
              const subOpts = !sub.grain
                ? [{ w: sub.l, h: sub.w, rot: false }, { w: sub.w, h: sub.l, rot: true }]
                : [{ w: sub.l, h: sub.w, rot: false }];
              for (const sOpt of subOpts) {
                if (sOpt.w <= colW && subY + sOpt.h <= curY + shelfHeight) {
                  placed.push({
                    row: sub.row,
                    x: colX,
                    y: subY,
                    w: sOpt.w,
                    h: sOpt.h,
                    rotated: sOpt.rot,
                    pieceIndex: sub.pieceIndex,
                  });
                  subY += sOpt.h + kerf;
                  if (j <= i) i--;
                  remaining.splice(j, 1);
                  j--;
                  break;
                }
              }
            }
          }
        }

        if (!placedOnShelf || shelfHeight === 0) {
          break;
        }
        curY += shelfHeight + kerf;
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

      matSheets.push({
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

    matSheets.forEach((s) => {
      s.matSheetCount = matSheets.length;
      allSheets.push(s);
    });
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

  const clipDefs: string[] = [];
  const partElements: string[] = [];

  const trimText = (txt: string, maxChars: number): string => {
    if (maxChars <= 4) return '';
    return txt.length > maxChars ? txt.slice(0, Math.max(2, maxChars - 1)).trimEnd() + '…' : txt;
  };

  parts.forEach((p, i) => {
    const px = sx0 + p.x;
    const py = sy0 + p.y;
    const clipId = `nest-clip-${sheet.matId}-${sheet.sheetIndex}-${i}`;
    clipDefs.push(`<clipPath id="${clipId}"><rect x="${px + 2}" y="${py + 2}" width="${Math.max(0, p.w - 4)}" height="${Math.max(0, p.h - 4)}" rx="2"/></clipPath>`);

    const longSide = Math.max(p.w, p.h);
    const shortSide = Math.min(p.w, p.h);
    const isVertical = p.h > p.w * 1.2;
    const isNarrowStrip = shortSide < 105;

    // Точное отображение кромкооблицовки ПВХ по сторонам детали:
    // 4 стороны (фасады/двери), 2 длинные стороны или 1 длинная лицевая сторона (полки, боковины, дно, крышка, цоколь)
    let edgeSvg = '';
    if (p.row.edgeMm > 0) {
      const peri = 2 * (longSide + shortSide);
      if (p.row.edgeMm >= peri * 0.75) {
        // Кромка кругом по 4 сторонам
        edgeSvg = `<rect x="${px + 3}" y="${py + 3}" width="${p.w - 6}" height="${p.h - 6}" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-dasharray="8 4"/>`;
      } else if (p.row.edgeMm >= longSide * 1.75) {
        // Кромка по 2 длинным сторонам
        edgeSvg = p.w >= p.h
          ? `<line x1="${px + 3}" y1="${py + 3}" x2="${px + p.w - 3}" y2="${py + 3}" stroke="#0284c7" stroke-width="2.4" stroke-dasharray="8 4"/>
             <line x1="${px + 3}" y1="${py + p.h - 3}" x2="${px + p.w - 3}" y2="${py + p.h - 3}" stroke="#0284c7" stroke-width="2.4" stroke-dasharray="8 4"/>`
          : `<line x1="${px + 3}" y1="${py + 3}" x2="${px + 3}" y2="${py + p.h - 3}" stroke="#0284c7" stroke-width="2.4" stroke-dasharray="8 4"/>
             <line x1="${px + p.w - 3}" y1="${py + 3}" x2="${px + p.w - 3}" y2="${py + p.h - 3}" stroke="#0284c7" stroke-width="2.4" stroke-dasharray="8 4"/>`;
      } else {
        // Кромка по 1 длинной (передней) стороне
        edgeSvg = p.w >= p.h
          ? `<line x1="${px + 3}" y1="${py + p.h - 3}" x2="${px + p.w - 3}" y2="${py + p.h - 3}" stroke="#0284c7" stroke-width="2.6" stroke-dasharray="8 4"/>`
          : `<line x1="${px + p.w - 3}" y1="${py + 3}" x2="${px + p.w - 3}" y2="${py + p.h - 3}" stroke="#0284c7" stroke-width="2.6" stroke-dasharray="8 4"/>`;
      }
    }

    // Бейдж номера детали на карте
    const badgeR = shortSide < 75 ? 11 : 14;
    const badgeCx = px + Math.min(22, Math.max(badgeR + 3, p.w * 0.15));
    const badgeCy = py + Math.min(22, Math.max(badgeR + 3, p.h * 0.25));
    const badgeFont = shortSide < 75 ? 11 : 13;

    // Расчёт размера шрифта и длины подписи строго по длинной стороне детали
    const usableSpan = Math.max(60, longSide - (isNarrowStrip ? 64 : 28));
    const cx = px + p.w / 2;
    const cy = py + p.h / 2;
    const rotAttr = isVertical ? ` transform="rotate(-90 ${cx} ${cy})"` : '';

    let textBlock = '';
    if (isNarrowStrip) {
      // Узкая планка (например, карниз 60 мм или цоколь 100 мм) — в одну компактную строку без наложений
      const fontSize = Math.max(11, Math.min(18, Math.floor(shortSide * 0.34), Math.floor(usableSpan / 16)));
      const maxChars = Math.floor(usableSpan / (fontSize * 0.56));
      const fullLine = `${p.row.name} (${p.w}×${p.h} мм · ${p.row.moduleName})`;
      const lineText = trimText(fullLine, maxChars);
      textBlock = `
        <g${rotAttr}>
          <text x="${cx}" y="${cy + fontSize * 0.35}" font-family="Inter, sans-serif" font-size="${fontSize}" font-weight="700" fill="#0f172a" text-anchor="middle">
            ${lineText}
          </text>
        </g>
      `;
    } else {
      // Двухстрочная подпись (название + габариты и модуль), адаптированная под ширину блока
      const labelFontSize = Math.max(12, Math.min(24, Math.floor(shortSide * 0.16), Math.floor(usableSpan / 11)));
      const subFontSize = Math.max(10, Math.min(16, Math.floor(labelFontSize * 0.74)));
      const maxTitleChars = Math.floor(usableSpan / (labelFontSize * 0.58));
      const maxSubChars = Math.floor(usableSpan / (subFontSize * 0.55));
      const titleStr = trimText(p.row.name, maxTitleChars);
      const subStr = trimText(`${p.w} × ${p.h} мм · ${p.row.moduleName}`, maxSubChars);
      const gap = Math.max(11, Math.round(subFontSize * 1.15));

      textBlock = `
        <g${rotAttr}>
          <text x="${cx}" y="${cy - 4}" font-family="Inter, sans-serif" font-size="${labelFontSize}" font-weight="700" fill="#0f172a" text-anchor="middle">
            ${titleStr}
          </text>
          <text x="${cx}" y="${cy - 4 + gap}" font-family="Inter, sans-serif" font-size="${subFontSize}" font-weight="600" fill="#475569" text-anchor="middle">
            ${subStr}
          </text>
        </g>
      `;
    }

    partElements.push(`
      <g class="nest-part" data-part="${p.row.name}">
        <!-- Тело детали -->
        <rect x="${px}" y="${py}" width="${p.w}" height="${p.h}"
          fill="#f8fafc" stroke="#334155" stroke-width="2.2" rx="2"/>
        
        <!-- Обозначение кромки ПВХ (только по фактическим кромленым торцам) -->
        ${edgeSvg}

        <!-- Внутреннее содержимое с защитой от выхода за границы детали -->
        <g clip-path="url(#${clipId})">
          ${textBlock}
          <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="#0284c7"/>
          <text x="${badgeCx}" y="${badgeCy + badgeFont * 0.36}" font-family="Inter, sans-serif" font-size="${badgeFont}" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>
        </g>
      </g>
    `);
  });

  return `
    <svg viewBox="0 0 ${viewBoxW} ${viewBoxH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border-radius:8px; user-select:none;">
      <defs>
        ${clipDefs.join('\n')}
      </defs>
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
