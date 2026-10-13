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
  const W = 360;
  const H = 480;
  const margin = 50;

  // Масштабирование фасада в область чертежа
  const drawW = W - 2 * margin;
  const drawH = H - 2 * margin;
  const scale = Math.min(drawW / facade.w, drawH / facade.h);

  const fw = facade.w * scale;
  const fh = facade.h * scale;
  const x0 = (W - fw) / 2;
  const y0 = (H - fh) / 2;

  // Сторона петель (петли слева или справа на виде изнутри)
  const isLeft = facade.hingeSide === 'left';
  const cupX = isLeft ? x0 + 21.5 * scale : x0 + fw - 21.5 * scale;
  const cupR = Math.max(7, (35 / 2) * scale);

  const cupsSvg = facade.hingeCups.map((c) => {
    // В мебели при виде изнутри y отсчитывается сверху или снизу
    const cy = y0 + fh - c.y * scale;
    return `
      <g class="hinge-cup">
        <!-- Окружность чашки петли Ø35 мм -->
        <circle cx="${cupX}" cy="${cy}" r="${cupR}" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.6" />
        <!-- Перекрестие центра чашки -->
        <line x1="${cupX - cupR - 3}" y1="${cy}" x2="${cupX + cupR + 3}" y2="${cy}" stroke="#0f172a" stroke-width="0.9" stroke-dasharray="3,1" />
        <line x1="${cupX}" y1="${cy - cupR - 3}" x2="${cupX}" y2="${cy + cupR + 3}" stroke="#0f172a" stroke-width="0.9" stroke-dasharray="3,1" />
        <circle cx="${cupX}" cy="${cy}" r="1.5" fill="#ef4444" />
        <!-- Подпись петли -->
        <text x="${isLeft ? cupX + cupR + 6 : cupX - cupR - 6}" y="${cy + 4}" font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#0f172a" text-anchor="${isLeft ? 'start' : 'end'}">Ø35 (гл. 11.5)</text>
      </g>
    `;
  }).join('');

  // Отверстия под ручку
  let handleSvg = '';
  if (facade.handleHoles) {
    const hh = facade.handleHoles;
    const hx = isLeft ? x0 + fw - 38 * scale : x0 + 38 * scale;
    const hy1 = y0 + fh - hh.y1 * scale;
    const hy2 = y0 + fh - hh.y2 * scale;
    handleSvg = `
      <g class="handle-holes">
        <circle cx="${hx}" cy="${hy1}" r="3" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1" />
        <circle cx="${hx}" cy="${hy2}" r="3" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1" />
        <line x1="${hx}" y1="${hy1}" x2="${hx}" y2="${hy2}" stroke="#3b82f6" stroke-width="1.2" stroke-dasharray="3,2" />
        <text x="${isLeft ? hx - 8 : hx + 8}" y="${(hy1 + hy2) / 2 + 4}" font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#1d4ed8" text-anchor="${isLeft ? 'end' : 'start'}">Ручка 128 мм</text>
      </g>
    `;
  }

  // Размерная линия отступа 21.5 мм от кромки
  const dim21 = `
    <g class="dim-21">
      <line x1="${isLeft ? x0 : x0 + fw}" y1="${y0 + 15}" x2="${cupX}" y2="${y0 + 15}" stroke="#475569" stroke-width="1" />
      <text x="${(cupX + (isLeft ? x0 : x0 + fw)) / 2}" y="${y0 + 10}" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle">21.5</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px;">
      <!-- Контур фасада -->
      <rect x="${x0}" y="${y0}" width="${fw}" height="${fh}" fill="#f8fafc" stroke="#0f172a" stroke-width="2" rx="2" />
      
      <!-- Заголовок детали -->
      <text x="${W / 2}" y="24" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">${facade.name}</text>
      <text x="${W / 2}" y="40" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Вид изнутри (присадка) · ${facade.w} × ${facade.h} × ${facade.t} мм</text>

      <!-- Разметка петель -->
      ${cupsSvg}
      ${dim21}
      ${handleSvg}

      <!-- Цепочка размеров по высоте слева или справа -->
      <line x1="${x0 - 15}" y1="${y0}" x2="${x0 - 15}" y2="${y0 + fh}" stroke="#64748b" stroke-width="1" />
      <line x1="${x0 - 20}" y1="${y0}" x2="${x0 - 10}" y2="${y0}" stroke="#64748b" stroke-width="1" />
      <line x1="${x0 - 20}" y1="${y0 + fh}" x2="${x0 - 10}" y2="${y0 + fh}" stroke="#64748b" stroke-width="1" />
      <text x="${x0 - 24}" y="${y0 + fh / 2}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="end">${facade.h}</text>

      <!-- Размер по ширине снизу -->
      <line x1="${x0}" y1="${y0 + fh + 15}" x2="${x0 + fw}" y2="${y0 + fh + 15}" stroke="#64748b" stroke-width="1" />
      <text x="${x0 + fw / 2}" y="${y0 + fh + 30}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">${facade.w} мм</text>
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
      <g transform="translate(${margin}, ${H - 26})">
        <circle cx="0" cy="0" r="4" fill="#fef08a" stroke="#ca8a04" stroke-width="1.4" />
        <text x="8" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Конфирмат 7×50</text>

        <circle cx="110" cy="0" r="3" fill="#fbcfe8" stroke="#db2777" stroke-width="1.2" />
        <text x="118" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Планка петли Ø5</text>

        <circle cx="220" cy="0" r="2.5" fill="#bae6fd" stroke="#0284c7" stroke-width="1" />
        <text x="228" y="3.5" font-family="Inter, sans-serif" font-size="9" fill="#334155">Полкодержатель Ø5</text>
      </g>

      <!-- Габариты -->
      <text x="${x0 + pw / 2}" y="${y0 + ph + 16}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">Глубина ${side.d} мм</text>
      <text x="${x0 - 10}" y="${y0 + ph / 2}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="end">${side.h}</text>
    </svg>
  `;
}
