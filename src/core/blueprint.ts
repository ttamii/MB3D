import type { ModuleDrilling, FacadeDrilling, SidePanelDrilling } from './drilling';

/**
 * Создаёт SVG сборочного чертежа модуля:
 * Слева — ортогональный фронтальный разрез с высотными отметками зон, ящиков, ниш и полок;
 * Справа — аксонометрия (изометрия) с точными выносными линиями позиций ①..Ⓝ по реальным 3D-координатам деталей.
 */
export function renderAssemblyBlueprintSvg(drilling: ModuleDrilling): string {
  const m = drilling.module;
  const W = 860;
  const H = 450;
  const isWallMod = m.kind === 'wall' || m.kind === 'cornerWall';
  const P = isWallMod ? 0 : m.plinth;
  const t = m.t || 16;
  const secN = Math.max(1, m.sections.length);
  const Wi = m.w - 2 * t;
  const cw = (Wi - (secN - 1) * t) / secN;
  const isTallOven = m.kind === 'tall' && /духов|свч/i.test(m.name);
  const isOvenBase = m.kind === 'base' && (/духов/i.test(m.name) || (secN === 1 && m.sections[0].drawers === 1 && m.sections[0].shelves === 1 && m.doorMode === 'none'));

  // ============================================================================
  // 1. ЛЕВАЯ ПОЛОВИНА (0..410): ФРОНТАЛЬНЫЙ РАЗРЕЗ (ВИД СПЕРЕДИ БЕЗ ФАСАДОВ)
  // ============================================================================
  const fAreaW = 270;
  const fAreaH = 310;
  const fScale = Math.min(fAreaW / Math.max(1, m.w), fAreaH / Math.max(1, m.h));
  const fw = m.w * fScale;
  const fh = m.h * fScale;
  const fx0 = 68 + (fAreaW - fw) / 2;
  const fy0 = 64 + (fAreaH - fh) / 2;
  const fY = (mmY: number) => fy0 + fh - mmY * fScale;
  const fX = (mmX: number) => fx0 + mmX * fScale;

  const frontElements: string[] = [];
  const frontDimsY: { yMm: number; label: string }[] = [{ yMm: 0, label: '0' }];

  // Цоколь
  if (P > 0) {
    frontElements.push(`
      <rect x="${fX(0).toFixed(1)}" y="${fY(P).toFixed(1)}" width="${fw.toFixed(1)}" height="${(P * fScale).toFixed(1)}" fill="#e2e8f0" stroke="#475569" stroke-width="1.2" />
      <text x="${(fx0 + fw / 2).toFixed(1)}" y="${(fY(P / 2) + 3.5).toFixed(1)}" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#475569" text-anchor="middle">Цоколь ${P} мм</text>
    `);
    frontDimsY.push({ yMm: P, label: String(P) });
  }

  // Левая и правая боковины, дно и крышка
  const bodyH = m.h - P;
  const tPx = Math.max(2.5, t * fScale);
  frontElements.push(`
    <!-- Задняя стенка ХДФ (фон проёма) -->
    <rect x="${fX(0).toFixed(1)}" y="${fY(m.h).toFixed(1)}" width="${fw.toFixed(1)}" height="${(bodyH * fScale).toFixed(1)}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" />
    <!-- Боковина L -->
    <rect x="${fX(0).toFixed(1)}" y="${fY(m.h).toFixed(1)}" width="${tPx.toFixed(1)}" height="${(bodyH * fScale).toFixed(1)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.2" />
    <!-- Боковина R -->
    <rect x="${(fX(m.w) - tPx).toFixed(1)}" y="${fY(m.h).toFixed(1)}" width="${tPx.toFixed(1)}" height="${(bodyH * fScale).toFixed(1)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.2" />
    <!-- Дно -->
    <rect x="${(fX(0) + tPx).toFixed(1)}" y="${(fY(P) - tPx).toFixed(1)}" width="${Math.max(2, fw - 2 * tPx).toFixed(1)}" height="${tPx.toFixed(1)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.2" />
    <!-- Крышка -->
    <rect x="${(fX(0) + tPx).toFixed(1)}" y="${fY(m.h).toFixed(1)}" width="${Math.max(2, fw - 2 * tPx).toFixed(1)}" height="${tPx.toFixed(1)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.2" />
  `);

  // Внутренние перегородки, ящики, ниши и полки по секциям
  for (let i = 1; i < secN; i++) {
    const sxMm = t + i * (cw + t) - t;
    frontElements.push(`
      <rect x="${fX(sxMm).toFixed(1)}" y="${(fY(m.h) + tPx).toFixed(1)}" width="${tPx.toFixed(1)}" height="${Math.max(2, (bodyH - 2 * t) * fScale).toFixed(1)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.1" />
    `);
  }

  m.sections.forEach((sec, idx) => {
    const xLeftMm = t + idx * (cw + t);
    const secX0 = fX(xLeftMm);
    const secW = cw * fScale;
    const nd = sec.drawers;
    const fullHeight = m.h - P - 4;
    const isFullHeight = (m.doorMode === 'none' || !sec.door) && sec.shelves === 0 && (sec.rods ?? 0) === 0 && !sec.rod;
    const fhStep = nd > 0
      ? (isTallOven ? Math.max(m.drawerH, Math.round(440 / nd)) : isFullHeight ? fullHeight / nd : Math.min(m.drawerH, fullHeight / nd))
      : 0;
    const zoneTop = nd > 0 ? P + Math.round(nd * fhStep) : P + t;

    // Ящики
    for (let k = 0; k < nd; k++) {
      const yBotMm = P + k * fhStep;
      const yTopMm = P + (k + 1) * fhStep;
      const dhMm = Math.round(yTopMm - yBotMm);
      frontElements.push(`
        <rect x="${(secX0 + 2).toFixed(1)}" y="${(fY(yTopMm) + 1.5).toFixed(1)}" width="${Math.max(4, secW - 4).toFixed(1)}" height="${Math.max(4, dhMm * fScale - 3).toFixed(1)}" fill="#eff6ff" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2" rx="1.5" />
        <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yBotMm + yTopMm) / 2) + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#1d4ed8" text-anchor="middle">Ящик ${nd > 1 ? k + 1 : ''} (${dhMm})</text>
      `);
      if (idx === 0) frontDimsY.push({ yMm: Math.round(yTopMm), label: String(Math.round(yTopMm)) });
    }

    // Разделительный горизонт над ящиками
    if (nd > 0 && !isFullHeight && (isTallOven || sec.shelves > 0 || (sec.rods ?? 0) > 0 || sec.rod)) {
      frontElements.push(`
        <rect x="${secX0.toFixed(1)}" y="${fY(zoneTop + t).toFixed(1)}" width="${secW.toFixed(1)}" height="${tPx.toFixed(1)}" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1" />
      `);
    }

    // Ниши под духовку и СВЧ в пенале
    const zTop = m.h - t;
    let upperZoneBottom = zoneTop;
    if (isTallOven && idx === 0) {
      const yOv0 = nd > 0 ? zoneTop + t : P + 450 + t;
      const ovH = 595;
      const yOv1 = yOv0 + ovH;
      if (yOv1 + t < zTop - 180) {
        frontElements.push(`
          <rect x="${(secX0 + 3).toFixed(1)}" y="${fY(yOv1).toFixed(1)}" width="${Math.max(6, secW - 6).toFixed(1)}" height="${(ovH * fScale).toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2" rx="2" />
          <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yOv0 + yOv1) / 2) - 2).toFixed(1)}" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle">НИША ДУХОВКИ</text>
          <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yOv0 + yOv1) / 2) + 10).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#475569" text-anchor="middle">H = 595 мм</text>
          <rect x="${secX0.toFixed(1)}" y="${fY(yOv1 + t).toFixed(1)}" width="${secW.toFixed(1)}" height="${tPx.toFixed(1)}" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1" />
        `);
        frontDimsY.push({ yMm: Math.round(yOv1), label: String(Math.round(yOv1)) });
        upperZoneBottom = yOv1 + t;

        const mwH = 380;
        const yMw0 = yOv1 + t;
        const yMw1 = yMw0 + mwH;
        if (/свч/i.test(m.name) && yMw1 + t < zTop - 220) {
          frontElements.push(`
            <rect x="${(secX0 + 3).toFixed(1)}" y="${fY(yMw1).toFixed(1)}" width="${Math.max(6, secW - 6).toFixed(1)}" height="${(mwH * fScale).toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2" rx="2" />
            <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yMw0 + yMw1) / 2) - 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#0f172a" text-anchor="middle">НИША СВЧ</text>
            <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yMw0 + yMw1) / 2) + 9).toFixed(1)}" font-family="Inter, sans-serif" font-size="8" font-weight="600" fill="#475569" text-anchor="middle">H = 380 мм</text>
            <rect x="${secX0.toFixed(1)}" y="${fY(yMw1 + t).toFixed(1)}" width="${secW.toFixed(1)}" height="${tPx.toFixed(1)}" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1" />
          `);
          frontDimsY.push({ yMm: Math.round(yMw1), label: String(Math.round(yMw1)) });
          upperZoneBottom = yMw1 + t;
        }
      }
    } else if (isOvenBase && idx === 0) {
      const yOv0 = zoneTop + t;
      const ovH = zTop - yOv0;
      if (ovH >= 320) {
        frontElements.push(`
          <rect x="${(secX0 + 3).toFixed(1)}" y="${fY(zTop).toFixed(1)}" width="${Math.max(6, secW - 6).toFixed(1)}" height="${(ovH * fScale).toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2" rx="2" />
          <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((yOv0 + zTop) / 2) + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle">НИША ДУХОВКИ (${Math.round(ovH)})</text>
        `);
      }
    }

    // Полки в верхней/основной зоне
    const shelfBase = isTallOven && idx === 0 ? upperZoneBottom : zoneTop;
    const shelfZoneH = zTop - shelfBase;
    const nShelvesToDraw = isTallOven && idx === 0 ? Math.max(1, sec.shelves - 2) : (isOvenBase ? 0 : sec.shelves);
    let prevY = shelfBase;
    for (let k = 1; k <= nShelvesToDraw; k++) {
      const yShelf = shelfBase + (k * shelfZoneH) / (nShelvesToDraw + 1);
      const gapMm = Math.round(yShelf - prevY);
      frontElements.push(`
        <rect x="${secX0.toFixed(1)}" y="${(fY(yShelf) - tPx / 2).toFixed(1)}" width="${secW.toFixed(1)}" height="${Math.max(2, tPx * 0.85).toFixed(1)}" fill="#cbd5e1" stroke="#334155" stroke-width="1" />
        ${secW > 42 ? `<text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((prevY + yShelf) / 2) + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8" font-weight="500" fill="#64748b" text-anchor="middle">проём ${gapMm}</text>` : ''}
      `);
      if (idx === 0) frontDimsY.push({ yMm: Math.round(yShelf), label: String(Math.round(yShelf)) });
      prevY = yShelf;
    }
    if (nShelvesToDraw > 0 && secW > 42) {
      const topGap = Math.round(zTop - prevY);
      frontElements.push(`
        <text x="${(secX0 + secW / 2).toFixed(1)}" y="${(fY((prevY + zTop) / 2) + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8" font-weight="500" fill="#64748b" text-anchor="middle">проём ${topGap}</text>
      `);
    }
  });

  frontDimsY.push({ yMm: m.h, label: String(m.h) });

  // Отрисовка высотных отметок слева от фронтального разреза
  const sortedFrontY = [...new Map(frontDimsY.map((d) => [d.yMm, d])).values()].sort((a, b) => a.yMm - b.yMm);
  const yTicksSvg: string[] = [];
  let lastLabelPy = 9999;
  sortedFrontY.forEach((ptY) => {
    const py = fY(ptY.yMm);
    const canShowText = Math.abs(py - lastLabelPy) >= 11 || ptY.yMm === m.h || ptY.yMm === 0;
    if (canShowText) lastLabelPy = py;
    yTicksSvg.push(`
      <line x1="${(fx0 - 22).toFixed(1)}" y1="${py.toFixed(1)}" x2="${fx0.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2,2" />
      <line x1="${(fx0 - 20).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(fx0 - 14).toFixed(1)}" y2="${py.toFixed(1)}" stroke="#334155" stroke-width="1" />
      ${canShowText ? `<text x="${(fx0 - 23).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#334155" text-anchor="end">${ptY.label}</text>` : ''}
    `);
  });

  // ============================================================================
  // 2. ПРАВАЯ ПОЛОВИНА (415..855): АКСОНОМЕТРИЯ С ТОЧНЫМИ ВЫНОСКАМИ ПОЗИЦИЙ ①..Ⓝ
  // ============================================================================
  const cx = 635;
  const cy = 262;
  const maxDim = Math.max(m.w, m.h, m.d);
  const scale = 205 / maxDim;

  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  const isoX = (x: number, z: number) => (x - z) * cos30 * scale;
  const isoY = (x: number, y: number, z: number) => -y * scale + (x + z) * sin30 * scale;

  const ptNum = (x: number, y: number, z: number): [number, number] => [
    cx + isoX(x, z),
    cy + isoY(x, y, z),
  ];
  const pt = (x: number, y: number, z: number) => {
    const [px, py] = ptNum(x, y, z);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  };

  const p000 = pt(0, 0, 0);
  const pW00 = pt(m.w, 0, 0);
  const p0H0 = pt(0, m.h, 0);
  const pWH0 = pt(m.w, m.h, 0);
  const p00D = pt(0, 0, m.d);
  const pW0D = pt(m.w, 0, m.d);
  const p0HD = pt(0, m.h, m.d);
  const pWHD = pt(m.w, m.h, m.d);

  // Внутренние линии полок и перегородок в изометрии
  const internalLines: string[] = [];
  if (P > 0) {
    const pBottomL = pt(0, P, m.d);
    const pBottomR = pt(m.w, P, m.d);
    internalLines.push(`<line x1="${pBottomL.split(',')[0]}" y1="${pBottomL.split(',')[1]}" x2="${pBottomR.split(',')[0]}" y2="${pBottomR.split(',')[1]}" stroke="#2563eb" stroke-width="1.2" />`);
  }

  for (let i = 1; i < secN; i++) {
    const xPos = t + i * (cw + t);
    const pSepFrontTop = pt(xPos, m.h - t, m.d);
    const pSepFrontBottom = pt(xPos, P + t, m.d);
    internalLines.push(`<line x1="${pSepFrontTop.split(',')[0]}" y1="${pSepFrontTop.split(',')[1]}" x2="${pSepFrontBottom.split(',')[0]}" y2="${pSepFrontBottom.split(',')[1]}" stroke="#1e293b" stroke-width="1.3" />`);
  }

  // Отрисовка реальных горизонтальных деталей (полок и горизонтов) из drilling.parts
  for (const dp of drilling.parts) {
    if (/полка|горизонт/i.test(dp.name)) {
      const [px, py, pz] = dp.part.pos;
      const [sx, , sz] = dp.part.size;
      const pSL = pt(px, py, pz + sz);
      const pSR = pt(px + sx, py, pz + sz);
      internalLines.push(`<line x1="${pSL.split(',')[0]}" y1="${pSL.split(',')[1]}" x2="${pSR.split(',')[0]}" y2="${pSR.split(',')[1]}" stroke="#475569" stroke-width="1.2" stroke-dasharray="3,2" />`);
    }
  }

  // Умная расстановка выносок ①..Ⓝ по реальным 3D-центрам деталей (без пересечения линий)
  const callouts: string[] = [];
  const topParts = drilling.parts.slice(0, 10);
  const leftBank: { posIndex: number; tx: number; ty: number }[] = [];
  const rightBank: { posIndex: number; tx: number; ty: number }[] = [];

  topParts.forEach((dp) => {
    const [px, py, pz] = dp.part.pos;
    const [sx, sy, sz] = dp.part.size;
    const [tx, ty] = ptNum(px + sx / 2, py + sy / 2, pz + sz / 2);
    if (tx <= cx) leftBank.push({ posIndex: dp.posIndex, tx, ty });
    else rightBank.push({ posIndex: dp.posIndex, tx, ty });
  });

  leftBank.sort((a, b) => a.ty - b.ty);
  rightBank.sort((a, b) => a.ty - b.ty);

  const placeBank = (bank: { posIndex: number; tx: number; ty: number }[], lx: number) => {
    const minY = 78;
    const maxY = H - 52;
    const stepY = bank.length > 1 ? Math.min(36, (maxY - minY) / (bank.length - 1)) : 0;
    const startY = bank.length > 1 ? Math.max(minY, (minY + maxY - stepY * (bank.length - 1)) / 2) : (minY + maxY) / 2;

    bank.forEach((item, idx) => {
      const ly = startY + idx * stepY;
      const elbowX = lx < cx ? lx + 18 : lx - 18;
      callouts.push(`
        <g class="callout">
          <polyline points="${item.tx.toFixed(1)},${item.ty.toFixed(1)} ${elbowX.toFixed(1)},${ly.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="#64748b" stroke-width="1" />
          <circle cx="${item.tx.toFixed(1)}" cy="${item.ty.toFixed(1)}" r="2.5" fill="#0284c7" />
          <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="11" fill="#ffffff" stroke="#0f172a" stroke-width="1.6" />
          <text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">${item.posIndex}</text>
        </g>
      `);
    });
  };

  placeBank(leftBank, 444);
  placeBank(rightBank, 824);

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px;">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="0.8"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569"/>
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      <!-- Разделительная вертикальная линия между видами -->
      <line x1="412" y1="14" x2="412" y2="${H - 14}" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

      <!-- ЗАГОЛОВКИ ПРОЕКЦИЙ -->
      <text x="206" y="24" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">ВИД СПЕРЕДИ (РАЗРЕЗ БЕЗ ФАСАДОВ)</text>
      <text x="206" y="39" font-family="Inter, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Высотные отметки Y (мм) · Чистый проём Wi = ${Wi} мм</text>

      <text x="635" y="24" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">АКСОНОМЕТРИЧЕСКАЯ СХЕМА СБОРКИ</text>
      <text x="635" y="39" font-family="Inter, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Номера позиций ①..Ⓝ соответствуют таблице деталей ниже</text>

      <!-- 1. ФРОНТАЛЬНЫЙ РАЗРЕЗ СЛЕВА -->
      <line x1="${(fx0 - 17).toFixed(1)}" y1="${fY(0).toFixed(1)}" x2="${(fx0 - 17).toFixed(1)}" y2="${fY(m.h).toFixed(1)}" stroke="#334155" stroke-width="1" />
      ${yTicksSvg.join('')}
      ${frontElements.join('')}

      <!-- Габарит ширины W под фронтальным разрезом -->
      <line x1="${fx0.toFixed(1)}" y1="${(fy0 + fh + 18).toFixed(1)}" x2="${(fx0 + fw).toFixed(1)}" y2="${(fy0 + fh + 18).toFixed(1)}" stroke="#334155" stroke-width="1.1" marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <text x="${(fx0 + fw / 2).toFixed(1)}" y="${(fy0 + fh + 33).toFixed(1)}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">Габарит W = ${m.w} мм (внутр. ${Wi} мм)</text>

      <!-- 2. ИЗОМЕТРИЯ СПРАВА -->
      <!-- Невидимые задние рёбра (пунктир) -->
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${pW00.split(',')[0]}" y2="${pW00.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${p0H0.split(',')[0]}" y2="${p0H0.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${p00D.split(',')[0]}" y2="${p00D.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />

      <!-- Внутреннее наполнение (полки, перегородки) -->
      ${internalLines.join('')}

      <!-- Видимые внешние рёбра шкафа -->
      <line x1="${p0H0.split(',')[0]}" y1="${p0H0.split(',')[1]}" x2="${pWH0.split(',')[0]}" y2="${pWH0.split(',')[1]}" stroke="#0f172a" stroke-width="1.8" />
      <line x1="${pWH0.split(',')[0]}" y1="${pWH0.split(',')[1]}" x2="${pW00.split(',')[0]}" y2="${pW00.split(',')[1]}" stroke="#0f172a" stroke-width="1.8" />

      <line x1="${p0H0.split(',')[0]}" y1="${p0H0.split(',')[1]}" x2="${p0HD.split(',')[0]}" y2="${p0HD.split(',')[1]}" stroke="#0f172a" stroke-width="1.8" />
      <line x1="${pWH0.split(',')[0]}" y1="${pWH0.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="1.8" />
      <line x1="${pW00.split(',')[0]}" y1="${pW00.split(',')[1]}" x2="${pW0D.split(',')[0]}" y2="${pW0D.split(',')[1]}" stroke="#0f172a" stroke-width="1.8" />

      <line x1="${p00D.split(',')[0]}" y1="${p00D.split(',')[1]}" x2="${pW0D.split(',')[0]}" y2="${pW0D.split(',')[1]}" stroke="#0f172a" stroke-width="2.1" />
      <line x1="${p0HD.split(',')[0]}" y1="${p0HD.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="2.1" />
      <line x1="${p00D.split(',')[0]}" y1="${p00D.split(',')[1]}" x2="${p0HD.split(',')[0]}" y2="${p0HD.split(',')[1]}" stroke="#0f172a" stroke-width="2.1" />
      <line x1="${pW0D.split(',')[0]}" y1="${pW0D.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="2.1" />

      <!-- Габариты на изометрии -->
      <text x="${cx}" y="${H - 16}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#334155" text-anchor="middle">Габариты модуля: ${m.w} × ${m.h} × ${m.d} мм · Плита ЛДСП ${t} мм</text>

      <!-- Выносные линии позиций ①..Ⓝ -->
      ${callouts.join('')}
    </svg>
  `;
}

/**
 * Создаёт SVG чертёж присадки фасадов (вид изнутри: разметка чашек петель Ø35 мм и ручек).
 */
export function renderFacadeDrillingSvg(facade: FacadeDrilling): string {
  const W = 430;
  const H = 520;
  const marginX = 78;
  const marginTop = 68;
  const marginBottom = 52;

  // Масштабирование фасада в область чертежа
  const drawW = W - 2 * marginX;
  const drawH = H - marginTop - marginBottom;
  const scale = Math.min(drawW / facade.w, drawH / facade.h);

  const fw = facade.w * scale;
  const fh = facade.h * scale;
  const x0 = (W - fw) / 2 + 12;
  const y0 = marginTop + (drawH - fh) / 2;

  // Сторона петель (петли слева или справа)
  const isLeft = facade.hingeSide === 'left';
  const edgeX = isLeft ? x0 : x0 + fw;
  const cupX = isLeft ? x0 + 21.5 * scale : x0 + fw - 21.5 * scale;
  const cupR = Math.max(6.5, (35 / 2) * scale);
  const flangeScrewX = isLeft ? cupX + 9.5 * scale : cupX - 9.5 * scale;
  const flangeHalfStep = Math.max(7.5, 24 * scale);

  const cupsSvg = facade.hingeCups.map((c) => {
    const cy = y0 + fh - c.y * scale;
    return `
      <g class="hinge-cup">
        <!-- Проушины фланца чашки под саморезы 3.5×16 (шаг 48 мм) -->
        <circle cx="${flangeScrewX.toFixed(1)}" cy="${(cy - flangeHalfStep).toFixed(1)}" r="1.7" fill="#ffffff" stroke="#475569" stroke-width="1" />
        <circle cx="${flangeScrewX.toFixed(1)}" cy="${(cy + flangeHalfStep).toFixed(1)}" r="1.7" fill="#ffffff" stroke="#475569" stroke-width="1" />
        <!-- Окружность чашки петли Ø35 мм -->
        <circle cx="${cupX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${cupR.toFixed(1)}" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5" />
        <!-- Перекрестие центра чашки -->
        <line x1="${(cupX - cupR - 3).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cupX + cupR + 3).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#0f172a" stroke-width="0.8" stroke-dasharray="3,1" />
        <line x1="${cupX.toFixed(1)}" y1="${(cy - cupR - 3).toFixed(1)}" x2="${cupX.toFixed(1)}" y2="${(cy + cupR + 3).toFixed(1)}" stroke="#0f172a" stroke-width="0.8" stroke-dasharray="3,1" />
        <circle cx="${cupX.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5" fill="#dc2626" />
        <!-- Подпись петли и высотной привязки Y от нижнего торца -->
        <text x="${(isLeft ? cupX + cupR + 7 : cupX - cupR - 7).toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#0f172a" text-anchor="${isLeft ? 'start' : 'end'}">Ø35 гл.11.5 <tspan fill="#475569" font-weight="500">(Y=${c.y})</tspan></text>
      </g>
    `;
  }).join('');

  // Цепочка шагов по высоте между чашками петель (слева от фасада)
  const sortedCups = [...facade.hingeCups].sort((a, b) => a.y - b.y);
  const yPtsMm = [0, ...sortedCups.map((c) => c.y), facade.h];
  const chainX = x0 - 16;
  const totalDimX = x0 - 44;

  const chainSegmentsSvg: string[] = [];
  for (let idx = 0; idx < yPtsMm.length - 1; idx++) {
    const mmA = yPtsMm[idx];
    const mmB = yPtsMm[idx + 1];
    const segMm = Math.round(mmB - mmA);
    const pyA = y0 + fh - mmA * scale;
    const pyB = y0 + fh - mmB * scale;
    const pyMid = (pyA + pyB) / 2;

    chainSegmentsSvg.push(`
      <line x1="${chainX}" y1="${pyB.toFixed(1)}" x2="${chainX}" y2="${pyA.toFixed(1)}" stroke="#94a3b8" stroke-width="0.9" />
      <line x1="${chainX - 3}" y1="${pyA.toFixed(1)}" x2="${chainX + 3}" y2="${pyA.toFixed(1)}" stroke="#64748b" stroke-width="1" />
      <line x1="${chainX - 3}" y1="${pyB.toFixed(1)}" x2="${chainX + 3}" y2="${pyB.toFixed(1)}" stroke="#64748b" stroke-width="1" />
      <text x="${chainX - 5}" y="${(pyMid + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#475569" text-anchor="end">${segMm}</text>
    `);
  }

  // Отверстия под ручку-скобу
  let handleSvg = '';
  if (facade.handleHoles) {
    const hh = facade.handleHoles;
    const hx = isLeft ? x0 + fw - 38 * scale : x0 + 38 * scale;
    const hy1 = y0 + fh - hh.y1 * scale;
    const hy2 = y0 + fh - hh.y2 * scale;
    const hyMid = (hy1 + hy2) / 2;
    handleSvg = `
      <g class="handle-holes">
        <circle cx="${hx.toFixed(1)}" cy="${hy1.toFixed(1)}" r="2.8" fill="#2563eb" stroke="#1e40af" stroke-width="1" />
        <circle cx="${hx.toFixed(1)}" cy="${hy2.toFixed(1)}" r="2.8" fill="#2563eb" stroke="#1e40af" stroke-width="1" />
        <line x1="${hx.toFixed(1)}" y1="${hy1.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy2.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="3,2" />
        <text x="${(isLeft ? hx - 7 : hx + 7).toFixed(1)}" y="${(hyMid - 2).toFixed(1)}" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#1d4ed8" text-anchor="${isLeft ? 'end' : 'start'}">Ручка ${hh.dist} мм</text>
        <text x="${(isLeft ? hx - 7 : hx + 7).toFixed(1)}" y="${(hyMid + 9).toFixed(1)}" font-family="Inter, sans-serif" font-size="8" font-weight="500" fill="#3b82f6" text-anchor="${isLeft ? 'end' : 'start'}">2×Ø5 сквозн. (край 38)</text>
      </g>
    `;
  }

  // Выносная размерная линия отступа 21.5 мм НАД верхним торцом фасада (без наложения на петлю)
  const dimY = y0 - 10;
  const dimLabelX = isLeft ? Math.max(edgeX + 14, (edgeX + cupX) / 2) : Math.min(edgeX - 14, (edgeX + cupX) / 2);
  const dim21 = `
    <g class="dim-21">
      <line x1="${edgeX.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${edgeX.toFixed(1)}" y2="${(dimY - 4).toFixed(1)}" stroke="#64748b" stroke-width="0.9" />
      <line x1="${cupX.toFixed(1)}" y1="${(y0 + fh - sortedCups[sortedCups.length - 1].y * scale).toFixed(1)}" x2="${cupX.toFixed(1)}" y2="${(dimY - 4).toFixed(1)}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2,2" />
      <line x1="${edgeX.toFixed(1)}" y1="${dimY.toFixed(1)}" x2="${cupX.toFixed(1)}" y2="${dimY.toFixed(1)}" stroke="#0f172a" stroke-width="1.1" />
      <circle cx="${edgeX.toFixed(1)}" cy="${dimY.toFixed(1)}" r="1.5" fill="#0f172a" />
      <circle cx="${cupX.toFixed(1)}" cy="${dimY.toFixed(1)}" r="1.5" fill="#0f172a" />
      <text x="${dimLabelX.toFixed(1)}" y="${(dimY - 5).toFixed(1)}" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#0f172a" text-anchor="middle">21.5 мм (K=4)</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px;">
      <!-- Контур фасада -->
      <rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="#f8fafc" stroke="#0f172a" stroke-width="2" rx="2" />
      
      <!-- Заголовок детали -->
      <text x="${W / 2}" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">${facade.name}</text>
      <text x="${W / 2}" y="38" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Карта присадки (тыльная сторона) · ${facade.w} × ${facade.h} × ${facade.t} мм</text>

      <!-- Разметка петель и ручек -->
      ${cupsSvg}
      ${dim21}
      ${handleSvg}

      <!-- Шаговая цепочка координат петель по высоте -->
      ${chainSegmentsSvg.join('')}

      <!-- Общий габарит по высоте слева -->
      <line x1="${totalDimX}" y1="${y0.toFixed(1)}" x2="${totalDimX}" y2="${(y0 + fh).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${totalDimX - 4}" y1="${y0.toFixed(1)}" x2="${totalDimX + 4}" y2="${y0.toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${totalDimX - 4}" y1="${(y0 + fh).toFixed(1)}" x2="${totalDimX + 4}" y2="${(y0 + fh).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <text x="${totalDimX - 6}" y="${(y0 + fh / 2 + 4).toFixed(1)}" font-family="Inter, sans-serif" font-size="10.5" font-weight="700" fill="#0f172a" text-anchor="end">${facade.h}</text>

      <!-- Размер по ширине снизу -->
      <line x1="${x0.toFixed(1)}" y1="${(y0 + fh + 16).toFixed(1)}" x2="${(x0 + fw).toFixed(1)}" y2="${(y0 + fh + 16).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${x0.toFixed(1)}" y1="${(y0 + fh + 12).toFixed(1)}" x2="${x0.toFixed(1)}" y2="${(y0 + fh + 20).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${(x0 + fw).toFixed(1)}" y1="${(y0 + fh + 12).toFixed(1)}" x2="${(x0 + fw).toFixed(1)}" y2="${(y0 + fh + 20).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <text x="${(x0 + fw / 2).toFixed(1)}" y="${(y0 + fh + 32).toFixed(1)}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">${facade.w} мм</text>
    </svg>
  `;
}

/**
 * Создаёт SVG чертёж сверловки боковины (конфирматы дна/крышки/горизонтов, планки петель, полкодержатели, направляющие)
 * с координатной сеткой X/Y в мм от базовых торцов.
 */
export function renderSidePanelDrillingSvg(side: SidePanelDrilling): string {
  const W = 500;
  const H = 530;
  const marginLeft = 58;
  const marginRight = 76;
  const marginTop = 66;
  const marginBottom = 64;

  const drawW = W - marginLeft - marginRight;
  const drawH = H - marginTop - marginBottom;
  const scale = Math.min(drawW / Math.max(1, side.d), drawH / Math.max(1, side.h));

  const pw = side.d * scale;
  const ph = side.h * scale;
  const x0 = marginLeft + (drawW - pw) / 2;
  const y0 = marginTop + (drawH - ph) / 2;

  // Уникальные уровни сверловки по высоте Y (снизу вверх) для координатной линейки справа
  const uniqueYs = [...new Set(side.holes.map((h) => Math.round(h.y)))].sort((a, b) => a - b);
  const yTicksSvg: string[] = [];
  let lastLabelPy = 9999;

  uniqueYs.forEach((yMm) => {
    const py = y0 + ph - yMm * scale;
    const maxHoleX = Math.max(...side.holes.filter((h) => Math.round(h.y) === yMm).map((h) => h.x));
    const startX = x0 + maxHoleX * scale + 5;
    const railX = x0 + pw + 14;
    const canLabel = Math.abs(py - lastLabelPy) >= 10 || yMm === uniqueYs[0] || yMm === uniqueYs[uniqueYs.length - 1];
    if (canLabel) lastLabelPy = py;

    yTicksSvg.push(`
      <line x1="${startX.toFixed(1)}" y1="${py.toFixed(1)}" x2="${railX.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="2,2" />
      <line x1="${(railX - 2.5).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(railX + 2.5).toFixed(1)}" y2="${py.toFixed(1)}" stroke="#475569" stroke-width="1" />
      ${canLabel ? `<text x="${(railX + 6).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#0f172a" text-anchor="start">Y=${yMm}</text>` : ''}
    `);
  });

  // Отрисовка отверстий
  const holesSvg = side.holes.map((hole) => {
    const cx = x0 + hole.x * scale;
    const cy = y0 + ph - hole.y * scale;

    if (hole.type === 'confirmat') {
      return `
        <g class="hole-confirmat">
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" />
          <line x1="${(cx - 3).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + 3).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#ca8a04" stroke-width="1" />
          <line x1="${cx.toFixed(1)}" y1="${(cy - 3).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(cy + 3).toFixed(1)}" stroke="#ca8a04" stroke-width="1" />
        </g>
      `;
    } else if (hole.type === 'hinge-plate') {
      return `
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="#fbcfe8" stroke="#db2777" stroke-width="1.4" />
      `;
    } else if (hole.type === 'shelf-pin') {
      return `
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.7" fill="#bae6fd" stroke="#0284c7" stroke-width="1.2" />
      `;
    } else if (hole.type === 'drawer-rail') {
      return `
        <g class="hole-rail">
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="#a7f3d0" stroke="#059669" stroke-width="1.4" />
          <line x1="${(cx - 2).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + 2).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#059669" stroke-width="0.9" />
        </g>
      `;
    }
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="#64748b" />`;
  }).join('');

  // Верхние привязки по оси X (от заднего торца X=50 и от передней кромки 37 мм)
  const x50Px = x0 + 50 * scale;
  const xFront37Px = x0 + (side.d - 37) * scale;

  return `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px;">
      <!-- Контур боковины -->
      <rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#f8fafc" stroke="#0f172a" stroke-width="2" rx="2" />

      <!-- Передняя кромка ПВХ (синий пунктир справа) и маркировка торцов -->
      <line x1="${(x0 + pw - 2.5).toFixed(1)}" y1="${(y0 + 2).toFixed(1)}" x2="${(x0 + pw - 2.5).toFixed(1)}" y2="${(y0 + ph - 2).toFixed(1)}" stroke="#0284c7" stroke-width="2" stroke-dasharray="5,3" />
      <text x="${(x0 - 6).toFixed(1)}" y="${(y0 + ph / 2).toFixed(1)}" transform="rotate(-90 ${(x0 - 6).toFixed(1)} ${(y0 + ph / 2).toFixed(1)})" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#64748b" text-anchor="middle">ЗАДНИЙ ТОРЕЦ (ХДФ)</text>
      <text x="${(x0 + pw - 8).toFixed(1)}" y="${(y0 + ph / 2).toFixed(1)}" transform="rotate(-90 ${(x0 + pw - 8).toFixed(1)} ${(y0 + ph / 2).toFixed(1)})" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#0284c7" text-anchor="middle">ПЕРЕДНЯЯ КРОМКА ПВХ</text>

      <!-- Заголовок -->
      <text x="${W / 2}" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">${side.name} (внутренняя пласть)</text>
      <text x="${W / 2}" y="38" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Карта присадки ЧПУ · ${side.h} × ${side.d} × ${side.t} мм · Отверстий: ${side.holes.length} шт</text>

      <!-- Верхние размерные привязки X=50 (сзади) и 37 мм (спереди, Система 32) -->
      <line x1="${x50Px.toFixed(1)}" y1="${(y0 - 12).toFixed(1)}" x2="${x50Px.toFixed(1)}" y2="${(y0 + ph).toFixed(1)}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3" />
      <text x="${x50Px.toFixed(1)}" y="${(y0 - 5).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#475569" text-anchor="middle">X=50</text>

      <line x1="${xFront37Px.toFixed(1)}" y1="${(y0 - 12).toFixed(1)}" x2="${xFront37Px.toFixed(1)}" y2="${(y0 + ph).toFixed(1)}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3" />
      <text x="${xFront37Px.toFixed(1)}" y="${(y0 - 5).toFixed(1)}" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#0284c7" text-anchor="middle">37 от переда</text>

      <!-- Шкала высотных отметок Y справа -->
      <line x1="${(x0 + pw + 14).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(x0 + pw + 14).toFixed(1)}" y2="${(y0 + ph).toFixed(1)}" stroke="#94a3b8" stroke-width="0.9" />
      ${yTicksSvg.join('')}

      <!-- Отверстия -->
      ${holesSvg}

      <!-- Габариты -->
      <line x1="${x0.toFixed(1)}" y1="${(y0 + ph + 15).toFixed(1)}" x2="${(x0 + pw).toFixed(1)}" y2="${(y0 + ph + 15).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${x0.toFixed(1)}" y1="${(y0 + ph + 11).toFixed(1)}" x2="${x0.toFixed(1)}" y2="${(y0 + ph + 19).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${(x0 + pw).toFixed(1)}" y1="${(y0 + ph + 11).toFixed(1)}" x2="${(x0 + pw).toFixed(1)}" y2="${(y0 + ph + 19).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <text x="${(x0 + pw / 2).toFixed(1)}" y="${(y0 + ph + 29).toFixed(1)}" font-family="Inter, sans-serif" font-size="10.5" font-weight="700" fill="#0f172a" text-anchor="middle">Глубина боковины D = ${side.d} мм</text>

      <line x1="${(x0 - 24).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(x0 - 24).toFixed(1)}" y2="${(y0 + ph).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${(x0 - 28).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(x0 - 20).toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <line x1="${(x0 - 28).toFixed(1)}" y1="${(y0 + ph).toFixed(1)}" x2="${(x0 - 20).toFixed(1)}" y2="${(y0 + ph).toFixed(1)}" stroke="#334155" stroke-width="1.1" />
      <text x="${(x0 - 28).toFixed(1)}" y="${(y0 + ph / 2 + 4).toFixed(1)}" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#0f172a" text-anchor="end">${side.h}</text>

      <!-- Легенда обозначений отверстий -->
      <g transform="translate(26, ${H - 16})">
        <circle cx="0" cy="0" r="4" fill="#fef08a" stroke="#ca8a04" stroke-width="1.4" />
        <text x="8" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#334155">Конфирмат Ø7</text>

        <circle cx="105" cy="0" r="3" fill="#fbcfe8" stroke="#db2777" stroke-width="1.2" />
        <text x="113" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#334155">Планка петли Ø5×12</text>

        <circle cx="235" cy="0" r="2.5" fill="#bae6fd" stroke="#0284c7" stroke-width="1" />
        <text x="243" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#334155">Полкодержатель Ø5×10</text>

        <circle cx="370" cy="0" r="3" fill="#a7f3d0" stroke="#059669" stroke-width="1.2" />
        <text x="378" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#334155">Направляющие Ø5</text>
      </g>
    </svg>
  `;
}
