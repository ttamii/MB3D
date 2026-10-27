type Child = Node | string | number | null | false | undefined;
type Props = Record<string, unknown> | null | undefined;

/** Безопасное создание DOM: текст — только через textContent, innerHTML не используется. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props?: Props, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = v;
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const NS = 'http://www.w3.org/2000/svg';

const ICONS: Record<string, string[]> = {
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
  redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13'],
  plus: ['M12 5v14M5 12h14'],
  trash: ['M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
  cube: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5M12 12v9M12 12L4 7.5'],
  list: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h7M9 17h7'],
  calc: ['M6 3h12v18H6z', 'M9 7h6', 'M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  sliders: ['M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0', 'M15 6a2 2 0 1 0 0 .01', 'M9 12a2 2 0 1 0 0 .01', 'M17 18a2 2 0 1 0 0 .01'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  download: ['M12 4v11M7 11l5 5 5-5M5 20h14'],
  upload: ['M12 16V5M7 9l5-5 5 5M5 20h14'],
  x: ['M6 6l12 12M18 6L6 18'],
  door: ['M5 21V4l9-2v19M14 21h6M11 12h.01'],
  check: ['M5 12l5 5 9-10'],
  grid: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  rows: ['M4 5h16M4 12h16M4 19h16'],
  printer: ['M7 9V3h10v6', 'M6 17H4v-7h16v7h-2', 'M7 14h10v7H7z'],
  info: ['M12 8h.01M11 12h1v5h1', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  wand: ['M15 4l5 5L7 22H2v-5L15 4z', 'M14 9l3 3', 'M4 4l1 2', 'M10 2l1 2', 'M2 10l2 1'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
  tools: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
};

export function icon(name: string, size = 18): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
  }
  return s;
}
