import type { ModuleDrilling, FacadeDrilling, SidePanelDrilling } from './drilling';

/**
 * Создаёт SVG сборочного чертежа модуля (аксонометрия + выносные линии с номерами позиций ①..Ⓝ).
 */
export function renderAssemblyBlueprintSvg(drilling: ModuleDrilling): string {
  const m = drilling.module;
  const W = 800;
  const H = 420;

  // Изометрическая проекция каркаса
  // Центр чертежа
  const cx = 380;
  const cy = 250;

  // Масштабирование под размеры модуля
  const maxDim = Math.max(m.w, m.h, m.d);
  const scale = 220 / maxDim;

  // Изометрические базисные векторы (30 градусов)
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  const isoX = (x: number, z: number) => (x - z) * cos30 * scale;
  const isoY = (x: number, y: number, z: number) => -y * scale + (x + z) * sin30 * scale;

  const pt = (x: number, y: number, z: number) => {
    return `${(cx + isoX(x, z)).toFixed(1)},${(cy + isoY(x, y, z)).toFixed(1)}`;
  };

  const p000 = pt(0, 0, 0);
  const pW00 = pt(m.w, 0, 0);
  const p0H0 = pt(0, m.h, 0);
  const pWH0 = pt(m.w, m.h, 0);
  const p00D = pt(0, 0, m.d);
  const pW0D = pt(m.w, 0, m.d);
  const p0HD = pt(0, m.h, m.d);
  const pWHD = pt(m.w, m.h, m.d);

  // Внутренние линии полок и перегородок
  const internalLines: string[] = [];
  const P = m.plinth;
  const secN = m.sections.length;
  const Wi = m.w - 2 * m.t;
  const cw = (Wi - (secN - 1) * m.t) / secN;

  // Дно
  const pBottomL = pt(0, P, m.d);
  const pBottomR = pt(m.w, P, m.d);
  internalLines.push(`<line x1="${pBottomL.split(',')[0]}" y1="${pBottomL.split(',')[1]}" x2="${pBottomR.split(',')[0]}" y2="${pBottomR.split(',')[1]}" stroke="#2563eb" stroke-width="1.2" />`);

  // Перегородки
  for (let i = 1; i < secN; i++) {
    const xPos = m.t + i * (cw + m.t);
    const pSepFrontTop = pt(xPos, m.h - m.t, m.d);
    const pSepFrontBottom = pt(xPos, P + m.t, m.d);
    internalLines.push(`<line x1="${pSepFrontTop.split(',')[0]}" y1="${pSepFrontTop.split(',')[1]}" x2="${pSepFrontBottom.split(',')[0]}" y2="${pSepFrontBottom.split(',')[1]}" stroke="#1e293b" stroke-width="1.4" />`);
  }

  // Полки в секциях
  m.sections.forEach((s, idx) => {
    const xLeft = m.t + idx * (cw + m.t);
    const xRight = xLeft + cw;
    const zoneTop = m.h - m.t;
    const zoneBottom = P + m.t;
    const zH = zoneTop - zoneBottom;
    for (let k = 1; k <= s.shelves; k++) {
      const yShelf = zoneBottom + (k * zH) / (s.shelves + 1);
      const pSL = pt(xLeft, yShelf, m.d - 20);
      const pSR = pt(xRight, yShelf, m.d - 20);
      internalLines.push(`<line x1="${pSL.split(',')[0]}" y1="${pSL.split(',')[1]}" x2="${pSR.split(',')[0]}" y2="${pSR.split(',')[1]}" stroke="#475569" stroke-width="1.2" stroke-dasharray="3,2" />`);
    }
  });

  // Выноски позиций (Callouts) с номерами в кружках ①..Ⓝ
  const callouts: string[] = [];
  const parts = drilling.parts.slice(0, 8); // основные позиции

  const calloutCoords = [
    { target: pt(0, m.h * 0.6, m.d * 0.5), labelPos: [70, 110] },      // Поз 1: Боковина L
    { target: pt(m.w, m.h * 0.6, m.d * 0.5), labelPos: [710, 110] },    // Поз 2: Боковина R
    { target: pt(m.w * 0.5, P, m.d * 0.5), labelPos: [230, 360] },     // Поз 3: Дно
    { target: pt(m.w * 0.5, m.h, m.d * 0.5), labelPos: [280, 50] },     // Поз 4: Крышка
    { target: pt(m.w * 0.5, m.h * 0.5, 0), labelPos: [650, 350] },     // Поз 5: Стойка/Задняя
    { target: pt(m.w * 0.3, m.h * 0.4, m.d), labelPos: [90, 270] },     // Поз 6: Фасад 1
    { target: pt(m.w * 0.7, m.h * 0.4, m.d), labelPos: [720, 270] },    // Поз 7: Фасад 2
    { target: pt(m.w * 0.5, 20, m.d * 0.9), labelPos: [480, 380] },     // Поз 8: Цоколь
  ];

  parts.forEach((p, idx) => {
    const c = calloutCoords[idx];
    if (!c) return;
    const [tx, ty] = c.target.split(',').map(Number);
    const [lx, ly] = c.labelPos;

    callouts.push(`
      <g class="callout">
        <line x1="${tx}" y1="${ty}" x2="${lx}" y2="${ly}" stroke="#64748b" stroke-width="1" />
        <circle cx="${tx}" cy="${ty}" r="2.5" fill="#0f172a" />
        <circle cx="${lx}" cy="${ly}" r="12" fill="#ffffff" stroke="#0f172a" stroke-width="1.8" />
        <text x="${lx}" y="${ly + 4.5}" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">${p.posIndex}</text>
      </g>
    `);
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px;">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="0.8"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569"/>
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      <!-- Габаритный контур каркаса -->
      <!-- Невидимые задние рёбра (пунктир) -->
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${pW00.split(',')[0]}" y2="${pW00.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${p0H0.split(',')[0]}" y2="${p0H0.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="${p000.split(',')[0]}" y1="${p000.split(',')[1]}" x2="${p00D.split(',')[0]}" y2="${p00D.split(',')[1]}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" />

      <!-- Внутреннее наполнение (полки, перегородки) -->
      ${internalLines.join('')}

      <!-- Видимые внешние рёбра шкафа -->
      <line x1="${p0H0.split(',')[0]}" y1="${p0H0.split(',')[1]}" x2="${pWH0.split(',')[0]}" y2="${pWH0.split(',')[1]}" stroke="#0f172a" stroke-width="2" />
      <line x1="${pWH0.split(',')[0]}" y1="${pWH0.split(',')[1]}" x2="${pW00.split(',')[0]}" y2="${pW00.split(',')[1]}" stroke="#0f172a" stroke-width="2" />

      <line x1="${p0H0.split(',')[0]}" y1="${p0H0.split(',')[1]}" x2="${p0HD.split(',')[0]}" y2="${p0HD.split(',')[1]}" stroke="#0f172a" stroke-width="2" />
      <line x1="${pWH0.split(',')[0]}" y1="${pWH0.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="2" />
      <line x1="${pW00.split(',')[0]}" y1="${pW00.split(',')[1]}" x2="${pW0D.split(',')[0]}" y2="${pW0D.split(',')[1]}" stroke="#0f172a" stroke-width="2" />

      <line x1="${p00D.split(',')[0]}" y1="${p00D.split(',')[1]}" x2="${pW0D.split(',')[0]}" y2="${pW0D.split(',')[1]}" stroke="#0f172a" stroke-width="2.2" />
      <line x1="${p0HD.split(',')[0]}" y1="${p0HD.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="2.2" />
      <line x1="${p00D.split(',')[0]}" y1="${p00D.split(',')[1]}" x2="${p0HD.split(',')[0]}" y2="${p0HD.split(',')[1]}" stroke="#0f172a" stroke-width="2.2" />
      <line x1="${pW0D.split(',')[0]}" y1="${pW0D.split(',')[1]}" x2="${pWHD.split(',')[0]}" y2="${pWHD.split(',')[1]}" stroke="#0f172a" stroke-width="2.2" />

      <!-- Габаритные размеры со стрелками -->
      <!-- Ширина W снизу -->
      <g>
        <line x1="${Number(p00D.split(',')[0])}" y1="${Number(p00D.split(',')[1]) + 24}" x2="${Number(pW0D.split(',')[0])}" y2="${Number(pW0D.split(',')[1]) + 24}" stroke="#475569" stroke-width="1.2" marker-start="url(#arrow)" marker-end="url(#arrow)" />
        <text x="${(Number(p00D.split(',')[0]) + Number(pW0D.split(',')[0])) / 2}" y="${(Number(p00D.split(',')[1]) + Number(pW0D.split(',')[1])) / 2 + 38}" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#334155" text-anchor="middle">${m.w} мм</text>
      </g>

      <!-- Высота H справа -->
      <g>
        <line x1="${Number(pWHD.split(',')[0]) + 28}" y1="${Number(pWHD.split(',')[1])}" x2="${Number(pW0D.split(',')[0]) + 28}" y2="${Number(pW0D.split(',')[1])}" stroke="#475569" stroke-width="1.2" marker-start="url(#arrow)" marker-end="url(#arrow)" />
        <text x="${Number(pWHD.split(',')[0]) + 48}" y="${(Number(pWHD.split(',')[1]) + Number(pW0D.split(',')[1])) / 2}" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#334155" text-anchor="middle">${m.h} мм</text>
      </g>

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
 * Создаёт SVG чертёж сверловки боковины (конфирматы дна/крышки, планки петель, полки).
 */
export function renderSidePanelDrillingSvg(side: SidePanelDrilling): string {
  const W = 460;
  const H = 480;
  const margin = 45;

  const drawW = W - 2 * margin;
  const drawH = H - 2 * margin;
  const scale = Math.min(drawW / side.d, drawH / side.h);

  const pw = side.d * scale;
  const ph = side.h * scale;
  const x0 = (W - pw) / 2;
  const y0 = (H - ph) / 2;

  // Отрисовка отверстий
  const holesSvg = side.holes.map((hole) => {
    // В боковине x отсчитывается сзади, y снизу
    const cx = x0 + hole.x * scale;
    const cy = y0 + ph - hole.y * scale;

    if (hole.type === 'confirmat') {
      return `
        <g class="hole-confirmat">
          <circle cx="${cx}" cy="${cy}" r="4" fill="#fef08a" stroke="#ca8a04" stroke-width="1.6" />
          <line x1="${cx - 3}" y1="${cy}" x2="${cx + 3}" y2="${cy}" stroke="#ca8a04" stroke-width="1" />
          <line x1="${cx}" y1="${cy - 3}" x2="${cx}" y2="${cy + 3}" stroke="#ca8a04" stroke-width="1" />
        </g>
      `;
    } else if (hole.type === 'hinge-plate') {
      return `
        <circle cx="${cx}" cy="${cy}" r="3" fill="#fbcfe8" stroke="#db2777" stroke-width="1.4" />
      `;
    } else if (hole.type === 'shelf-pin') {
      return `
        <circle cx="${cx}" cy="${cy}" r="2.5" fill="#bae6fd" stroke="#0284c7" stroke-width="1.2" />
      `;
    } else if (hole.type === 'drawer-rail') {
      return `
        <g class="hole-rail">
          <circle cx="${cx}" cy="${cy}" r="3" fill="#a7f3d0" stroke="#059669" stroke-width="1.4" />
          <line x1="${cx - 2}" y1="${cy}" x2="${cx + 2}" y2="${cy}" stroke="#059669" stroke-width="0.9" />
        </g>
      `;
    }
    return `<circle cx="${cx}" cy="${cy}" r="2" fill="#64748b" />`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px;">
      <!-- Контур боковины -->
      <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="#f8fafc" stroke="#0f172a" stroke-width="2" rx="2" />

      <!-- Заголовок -->
      <text x="${W / 2}" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">${side.name}</text>
      <text x="${W / 2}" y="38" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Сверловка под конфирматы и петли · ${side.h} × ${side.d} мм</text>

      <!-- Отверстия -->
      ${holesSvg}

      <!-- Легенда обозначений отверстий -->
      <g transform="translate(${margin - 10}, ${H - 26})">
        <circle cx="0" cy="0" r="4" fill="#fef08a" stroke="#ca8a04" stroke-width="1.4" />
        <text x="8" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Конфирмат 7×50</text>

        <circle cx="95" cy="0" r="3" fill="#fbcfe8" stroke="#db2777" stroke-width="1.2" />
        <text x="103" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Планка петли Ø5</text>

        <circle cx="195" cy="0" r="2.5" fill="#bae6fd" stroke="#0284c7" stroke-width="1" />
        <text x="203" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Полкодержатель Ø5</text>

        <circle cx="300" cy="0" r="3" fill="#a7f3d0" stroke="#059669" stroke-width="1.2" />
        <text x="308" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Направляющие Ø5</text>
      </g>

      <!-- Габариты -->
      <text x="${x0 + pw / 2}" y="${y0 + ph + 16}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">Глубина ${side.d} мм</text>
      <text x="${x0 - 10}" y="${y0 + ph / 2}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="end">${side.h}</text>
    </svg>
  `;
}
