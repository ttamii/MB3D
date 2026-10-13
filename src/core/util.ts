export function uid(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clamp(num(v, fallback), min, max));
}

export function money(n: number, cur = '₸'): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + '\u00A0' + cur;
}

export function fmtNum(n: number, d = 2): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: number | undefined;
  return (...a: A) => {
    if (t !== undefined) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export function rafThrottle<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
  let queued = false;
  let last: A;
  return (...a: A) => {
    last = a;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...last);
    });
  };
}

export function safeText(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function fileName(s: string): string {
  return (s || 'project').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
}
