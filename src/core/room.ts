import type { Module } from './types';

export interface WindowItem {
  id: string;
  wall: 'back' | 'left' | 'right';
  x: number;      // отступ от левого угла стены, мм
  w: number;      // ширина окна, мм
  h: number;      // высота окна, мм
  lift: number;   // от пола (подоконник), мм
}

export interface DoorItem {
  id: string;
  wall: 'back' | 'left' | 'right';
  x: number;      // отступ от левого угла стены, мм
  w: number;      // ширина двери, мм
  h: number;      // высота двери, мм
  swing: 'in' | 'out';
}

export interface RoomConfig {
  w: number;             // ширина комнаты (вдоль задней стены), мм
  d: number;             // глубина комнаты (боковые стены), мм
  h: number;             // высота потолка, мм
  wallThickness: number; // толщина стен, мм
  windows: WindowItem[];
  doors: DoorItem[];
}

export const DEFAULT_ROOM: RoomConfig = {
  w: 4500,
  d: 3000,
  h: 2700,
  wallThickness: 150,
  windows: [],
  doors: [
    { id: 'd1', wall: 'left', x: 743, w: 800, h: 2100, swing: 'in' },
  ],
};

/** Генерирует векторный 2D-план помещения (вид сверху с цепочками размеров), как в Qdesign / CAD */
export function renderRoomPlanSvg(
  room: RoomConfig,
  modules: Module[] = [],
  selectedId?: string,
): string {
  const { w: W, d: D, wallThickness: WT } = room;
  const pad = 130; // отступ под размерные цепочки и надписи
  const viewBoxW = W + WT * 2 + pad * 2;
  const viewBoxH = D + WT * 2 + pad * 2;

  // Базовые координаты внутреннего пространства
  const rx0 = pad + WT;
  const ry0 = pad + WT;

  const lines: string[] = [];
  const texts: string[] = [];

  const dimH = (x1: number, x2: number, y: number, text: string, highlight = false) => {
    if (x2 - x1 < 10) return;
    const mx = (x1 + x2) / 2;
    lines.push(
      `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
      `<line x1="${x1}" y1="${y - 8}" x2="${x1}" y2="${y + 8}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
      `<line x1="${x2}" y1="${y - 8}" x2="${x2}" y2="${y + 8}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
    );
    if (highlight) {
      const bw = Math.max(46, text.length * 10 + 12);
      texts.push(
        `<rect x="${mx - bw / 2}" y="${y - 18}" width="${bw}" height="16" rx="4" fill="#0284c7"/>`,
        `<text x="${mx}" y="${y - 6}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${text}</text>`,
      );
    } else {
      texts.push(
        `<text x="${mx}" y="${y - 5}" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#475569" text-anchor="middle">${text}</text>`,
      );
    }
  };

  const dimV = (x: number, y1: number, y2: number, text: string, highlight = false) => {
    if (y2 - y1 < 10) return;
    const my = (y1 + y2) / 2;
    lines.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
      `<line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
      `<line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" stroke="${highlight ? '#0284c7' : '#64748b'}" stroke-width="${highlight ? '2' : '1.5'}"/>`,
    );
    if (highlight) {
      const bw = Math.max(46, text.length * 10 + 12);
      texts.push(
        `<rect x="${x - bw - 4}" y="${my - 9}" width="${bw}" height="18" rx="4" fill="#0284c7"/>`,
        `<text x="${x - bw / 2 - 4}" y="${my + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${text}</text>`,
      );
    } else {
      texts.push(
        `<text x="${x - 8}" y="${my + 5}" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#475569" text-anchor="end">${text}</text>`,
      );
    }
  };

  // Внешние габаритные размеры стен
  dimH(rx0, rx0 + W, ry0 - 55, `${W} мм`);
  dimV(rx0 - 55, ry0, ry0 + D, `${D} мм`);
  dimH(rx0, rx0 + W, ry0 + D + 55, `${W} мм`);
  dimV(rx0 + W + 55, ry0, ry0 + D, `${D} мм`);

  // Надписи стен
  texts.push(
    `<text x="${rx0 + W / 2}" y="${ry0 - WT - 25}" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" letter-spacing="1">ЗАДНЯЯ СТЕНА (${W} мм)</text>`,
    `<text x="${rx0 - WT - 35}" y="${ry0 + D / 2}" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" transform="rotate(-90 ${rx0 - WT - 35} ${ry0 + D / 2})" letter-spacing="1">ЛЕВАЯ СТЕНА (${D} мм)</text>`,
    `<text x="${rx0 + W + WT + 35}" y="${ry0 + D / 2}" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" transform="rotate(90 ${rx0 + W + WT + 35} ${ry0 + D / 2})" letter-spacing="1">ПРАВАЯ СТЕНА (${D} мм)</text>`,
  );

  // Окна на стенах
  const winShapes: string[] = [];
  room.windows.forEach((win) => {
    const isSel = win.id === selectedId;
    if (win.wall === 'back') {
      const wx0 = rx0 + win.x;
      winShapes.push(`
        <g class="plan-interactive" data-type="window" data-id="${win.id}" style="cursor: grab;">
          <rect x="${wx0}" y="${ry0 - WT}" width="${win.w}" height="${WT}" fill="${isSel ? '#fef08a' : '#fef9c3'}" stroke="${isSel ? '#0284c7' : '#ca8a04'}" stroke-width="${isSel ? '3' : '2'}"/>
          <line x1="${wx0}" y1="${ry0 - WT / 2}" x2="${wx0 + win.w}" y2="${ry0 - WT / 2}" stroke="#ca8a04" stroke-width="2"/>
          <line x1="${wx0}" y1="${ry0 - WT * 0.75}" x2="${wx0 + win.w}" y2="${ry0 - WT * 0.75}" stroke="#ca8a04" stroke-width="1.5"/>
          <line x1="${wx0}" y1="${ry0 - WT * 0.25}" x2="${wx0 + win.w}" y2="${ry0 - WT * 0.25}" stroke="#ca8a04" stroke-width="1.5"/>
          <circle cx="${wx0 + win.w / 2}" cy="${ry0 - WT / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#ca8a04'}" stroke-width="2"/>
          <text x="${wx0 + win.w / 2}" y="${ry0 - WT / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#ca8a04'}" text-anchor="middle" pointer-events="none">OKHO</text>
        </g>
      `);
      dimH(rx0, wx0, ry0 - 20, `${win.x}`, isSel);
      dimH(wx0, wx0 + win.w, ry0 - 20, `${win.w}`, isSel);
      dimH(wx0 + win.w, rx0 + W, ry0 - 20, `${W - win.x - win.w}`, isSel);
    } else if (win.wall === 'left') {
      const wy0 = ry0 + win.x;
      winShapes.push(`
        <g class="plan-interactive" data-type="window" data-id="${win.id}" style="cursor: grab;">
          <rect x="${rx0 - WT}" y="${wy0}" width="${WT}" height="${win.w}" fill="${isSel ? '#fef08a' : '#fef9c3'}" stroke="${isSel ? '#0284c7' : '#ca8a04'}" stroke-width="${isSel ? '3' : '2'}"/>
          <line x1="${rx0 - WT / 2}" y1="${wy0}" x2="${rx0 - WT / 2}" y2="${wy0 + win.w}" stroke="#ca8a04" stroke-width="2"/>
          <circle cx="${rx0 - WT / 2}" cy="${wy0 + win.w / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#ca8a04'}" stroke-width="2"/>
          <text x="${rx0 - WT / 2}" y="${wy0 + win.w / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#ca8a04'}" text-anchor="middle" pointer-events="none">OKHO</text>
        </g>
      `);
      dimV(rx0 - 20, ry0, wy0, `${win.x}`, isSel);
      dimV(rx0 - 20, wy0, wy0 + win.w, `${win.w}`, isSel);
      dimV(rx0 - 20, wy0 + win.w, ry0 + D, `${D - win.x - win.w}`, isSel);
    } else if (win.wall === 'right') {
      const wy0 = ry0 + win.x;
      winShapes.push(`
        <g class="plan-interactive" data-type="window" data-id="${win.id}" style="cursor: grab;">
          <rect x="${rx0 + W}" y="${wy0}" width="${WT}" height="${win.w}" fill="${isSel ? '#fef08a' : '#fef9c3'}" stroke="${isSel ? '#0284c7' : '#ca8a04'}" stroke-width="${isSel ? '3' : '2'}"/>
          <line x1="${rx0 + W + WT / 2}" y1="${wy0}" x2="${rx0 + W + WT / 2}" y2="${wy0 + win.w}" stroke="#ca8a04" stroke-width="2"/>
          <circle cx="${rx0 + W + WT / 2}" cy="${wy0 + win.w / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#ca8a04'}" stroke-width="2"/>
          <text x="${rx0 + W + WT / 2}" y="${wy0 + win.w / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#ca8a04'}" text-anchor="middle" pointer-events="none">OKHO</text>
        </g>
      `);
      dimV(rx0 + W + 20, ry0, wy0, `${win.x}`, isSel);
      dimV(rx0 + W + 20, wy0, wy0 + win.w, `${win.w}`, isSel);
      dimV(rx0 + W + 20, wy0 + win.w, ry0 + D, `${D - win.x - win.w}`, isSel);
    }
  });

  // Двери на стенах
  const doorShapes: string[] = [];
  room.doors.forEach((door) => {
    const isSel = door.id === selectedId;
    const isOut = door.swing === 'out';

    if (door.wall === 'left') {
      const dy0 = ry0 + door.x;
      const leafX = isOut ? rx0 - WT - door.w * 0.707 : rx0 + door.w * 0.707;
      const leafY = dy0 + door.w * 0.293;
      const arcSweep = isOut ? '0' : '1';
      doorShapes.push(`
        <g class="plan-interactive" data-type="door" data-id="${door.id}" style="cursor: grab;">
          <rect x="${rx0 - WT}" y="${dy0}" width="${WT}" height="${door.w}" fill="#ffffff" stroke="${isSel ? '#0284c7' : '#475569'}" stroke-width="${isSel ? '3' : '1.5'}"/>
          <line x1="${isOut ? rx0 - WT : rx0}" y1="${dy0}" x2="${leafX}" y2="${leafY}" stroke="#0f172a" stroke-width="3"/>
          <path d="M ${isOut ? rx0 - WT : rx0} ${dy0 + door.w} A ${door.w} ${door.w} 0 0 ${arcSweep} ${leafX} ${leafY}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-dasharray="4 4"/>
          <circle cx="${rx0 - WT / 2}" cy="${dy0 + door.w / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#3b82f6'}" stroke-width="2"/>
          <text x="${rx0 - WT / 2}" y="${dy0 + door.w / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#3b82f6'}" text-anchor="middle" pointer-events="none">ДВЕРЬ</text>
        </g>
      `);
      dimV(rx0 - 20, ry0, dy0, `${door.x}`, isSel);
      dimV(rx0 - 20, dy0, dy0 + door.w, `${door.w}`, isSel);
      dimV(rx0 - 20, dy0 + door.w, ry0 + D, `${D - door.x - door.w}`, isSel);
    } else if (door.wall === 'right') {
      const dy0 = ry0 + door.x;
      const leafX = isOut ? rx0 + W + WT + door.w * 0.707 : rx0 + W - door.w * 0.707;
      const leafY = dy0 + door.w * 0.293;
      const arcSweep = isOut ? '1' : '0';
      doorShapes.push(`
        <g class="plan-interactive" data-type="door" data-id="${door.id}" style="cursor: grab;">
          <rect x="${rx0 + W}" y="${dy0}" width="${WT}" height="${door.w}" fill="#ffffff" stroke="${isSel ? '#0284c7' : '#475569'}" stroke-width="${isSel ? '3' : '1.5'}"/>
          <line x1="${isOut ? rx0 + W + WT : rx0 + W}" y1="${dy0}" x2="${leafX}" y2="${leafY}" stroke="#0f172a" stroke-width="3"/>
          <path d="M ${isOut ? rx0 + W + WT : rx0 + W} ${dy0 + door.w} A ${door.w} ${door.w} 0 0 ${arcSweep} ${leafX} ${leafY}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-dasharray="4 4"/>
          <circle cx="${rx0 + W + WT / 2}" cy="${dy0 + door.w / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#3b82f6'}" stroke-width="2"/>
          <text x="${rx0 + W + WT / 2}" y="${dy0 + door.w / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#3b82f6'}" text-anchor="middle" pointer-events="none">ДВЕРЬ</text>
        </g>
      `);
      dimV(rx0 + W + 20, ry0, dy0, `${door.x}`, isSel);
      dimV(rx0 + W + 20, dy0, dy0 + door.w, `${door.w}`, isSel);
      dimV(rx0 + W + 20, dy0 + door.w, ry0 + D, `${D - door.x - door.w}`, isSel);
    } else if (door.wall === 'back') {
      const dx0 = rx0 + door.x;
      const leafX = dx0 + door.w * 0.293;
      const leafY = isOut ? ry0 - WT - door.w * 0.707 : ry0 + door.w * 0.707;
      const arcSweep = isOut ? '0' : '1';
      doorShapes.push(`
        <g class="plan-interactive" data-type="door" data-id="${door.id}" style="cursor: grab;">
          <rect x="${dx0}" y="${ry0 - WT}" width="${door.w}" height="${WT}" fill="#ffffff" stroke="${isSel ? '#0284c7' : '#475569'}" stroke-width="${isSel ? '3' : '1.5'}"/>
          <line x1="${dx0}" y1="${isOut ? ry0 - WT : ry0}" x2="${leafX}" y2="${leafY}" stroke="#0f172a" stroke-width="3"/>
          <path d="M ${dx0 + door.w} ${isOut ? ry0 - WT : ry0} A ${door.w} ${door.w} 0 0 ${arcSweep} ${leafX} ${leafY}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-dasharray="4 4"/>
          <circle cx="${dx0 + door.w / 2}" cy="${ry0 - WT / 2}" r="17" fill="${isSel ? '#0284c7' : '#ffffff'}" stroke="${isSel ? '#0369a1' : '#3b82f6'}" stroke-width="2"/>
          <text x="${dx0 + door.w / 2}" y="${ry0 - WT / 2 + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${isSel ? '#ffffff' : '#3b82f6'}" text-anchor="middle" pointer-events="none">ДВЕРЬ</text>
        </g>
      `);
      dimH(rx0, dx0, ry0 - 20, `${door.x}`, isSel);
      dimH(dx0, dx0 + door.w, ry0 - 20, `${door.w}`, isSel);
      dimH(dx0 + door.w, rx0 + W, ry0 - 20, `${W - door.x - door.w}`, isSel);
    }
  });

  // Модули мебели на плане
  const modShapes: string[] = [];
  modules.forEach((m) => {
    const mx0 = rx0 + m.x;
    const my0 = ry0; // у задней стены
    const mw = m.w;
    const md = m.d;
    const isBase = m.kind === 'base' || m.kind === 'tall' || m.kind === 'wardrobe';
    modShapes.push(`
      <rect x="${mx0}" y="${my0}" width="${mw}" height="${md}" fill="${isBase ? '#e2e8f0' : '#f8fafc'}" stroke="#475569" stroke-width="2"/>
      <text x="${mx0 + mw / 2}" y="${my0 + md / 2 + 5}" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">${m.name}</text>
    `);
  });

  // Маркер масштабирования комнаты за угол (как в CAD)
  const cornerHandle = `
    <g class="plan-interactive" data-type="corner" style="cursor: nwse-resize;">
      <circle cx="${rx0 + W}" cy="${ry0 + D}" r="22" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>
      <circle cx="${rx0 + W}" cy="${ry0 + D}" r="8" fill="#0284c7"/>
      <text x="${rx0 + W + 14}" y="${ry0 + D + 18}" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#0284c7">Размер</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${viewBoxW} ${viewBoxH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="user-select:none;">
      <defs>
        <!-- Сетка пола -->
        <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f1f5f9" stroke-width="1.5"/>
        </pattern>
      </defs>

      <!-- Фон комнаты со светлой сеткой -->
      <rect x="${rx0}" y="${ry0}" width="${W}" height="${D}" fill="#fafaf9"/>
      <rect x="${rx0}" y="${ry0}" width="${W}" height="${D}" fill="url(#gridPattern)"/>

      <!-- Модули мебели -->
      ${modShapes.join('\n')}

      <!-- Внешние толстые стены комнаты (темно-серые, как в архитектурных чертежах) -->
      <!-- Верхняя стена -->
      <rect x="${rx0 - WT}" y="${ry0 - WT}" width="${W + WT * 2}" height="${WT}" fill="#1e293b"/>
      <!-- Нижняя стена -->
      <rect x="${rx0 - WT}" y="${ry0 + D}" width="${W + WT * 2}" height="${WT}" fill="#1e293b"/>
      <!-- Левая стена -->
      <rect x="${rx0 - WT}" y="${ry0}" width="${WT}" height="${D}" fill="#1e293b"/>
      <!-- Правая стена -->
      <rect x="${rx0 + W}" y="${ry0}" width="${WT}" height="${D}" fill="#1e293b"/>

      <!-- Оконные проёмы -->
      ${winShapes.join('\n')}

      <!-- Дверные проёмы -->
      ${doorShapes.join('\n')}

      <!-- Угловой маркер масштабирования -->
      ${cornerHandle}

      <!-- Размерные линии и стрелки -->
      ${lines.join('\n')}
      ${texts.join('\n')}
    </svg>
  `;
}
