import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Процедурная текстура древесного рисунка (вертикальные волокна). Без внешних файлов. */
export function grainTexture(hex: string, anisotropy: number): CanvasTexture {
  const hit = cache.get(hex);
  if (hit) return hit;

  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const base = new Color(hex);
  const rnd = mulberry32(hex.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));

  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const dark = rnd() > 0.45;
    const a = 0.03 + rnd() * 0.09;
    g.strokeStyle = dark ? `rgba(40,22,8,${a})` : `rgba(255,240,215,${a * 0.9})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    const amp = 2 + rnd() * 6;
    const f = 0.004 + rnd() * 0.01;
    const ph = rnd() * 6.28;
    for (let y = 0; y <= H; y += 8) {
      const xx = x + Math.sin(y * f + ph) * amp;
      if (y === 0) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.stroke();
  }
  // мелкие поры
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(30,15,5,${0.04 + rnd() * 0.06})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 4 + rnd() * 14);
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  cache.set(hex, tex);
  return tex;
}

/** Процедурная текстура камня, бетона и мрамора. */
export function stoneTexture(hex: string, anisotropy: number): CanvasTexture {
  const hit = cache.get('stone:' + hex);
  if (hit) return hit;

  const W = 256;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const base = new Color(hex);
  const rnd = mulberry32(hex.split('').reduce((a, ch) => a * 37 + ch.charCodeAt(0), 13));

  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, W, H);

  // Пятнистая фактура бетона/камня
  for (let i = 0; i < 40; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const r = 20 + rnd() * 60;
    const dark = rnd() > 0.5;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const alpha = 0.04 + rnd() * 0.08;
    grad.addColorStop(0, dark ? `rgba(20,20,22,${alpha})` : `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  // Прожилки мрамора
  for (let i = 0; i < 6; i++) {
    let x = rnd() * W;
    let y = rnd() * H;
    const alpha = 0.05 + rnd() * 0.09;
    g.strokeStyle = rnd() > 0.4 ? `rgba(255,255,255,${alpha})` : `rgba(15,15,18,${alpha})`;
    g.lineWidth = 0.8 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let step = 0; step < 10; step++) {
      x += (rnd() - 0.5) * 35;
      y += (rnd() - 0.3) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Мелкая минеральная зернистость
  for (let i = 0; i < 280; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  cache.set('stone:' + hex, tex);
  return tex;
}
