import { buildModule } from './geometry';
import type { Material, Module, Part, Settings } from './types';

export interface CutRow {
  key: string;
  name: string;
  moduleId: string;
  moduleName: string;
  l: number;
  w: number;
  t: number;
  qty: number;
  matId: string;
  matName: string;
  edgeMm: number;
}

export interface Line {
  key: string;
  name: string;
  unit: string;
  qty: number;
  cost: number;
}

export interface Estimate {
  cut: CutRow[];
  materials: Line[];
  edge: Line;
  hardware: Line[];
  labor: Line[];
  direct: number;
  laborTotal: number;
  markup: number;
  total: number;
  perModule: Record<string, number>;
  area: number;
}

export function partMaterialId(p: Part, m: Module): string | null {
  switch (p.mat) {
    case 'corpus': return m.matCorpus;
    case 'black': return 'eg-u999';
    case 'facade': return m.matFacade;
    case 'back': return m.matBack;
    case 'top': return m.matTop;
    default: return null;
  }
}

export function partDims(p: Part): { l: number; w: number; t: number } {
  const s = [...p.size].sort((a, b) => a - b);
  return { t: s[0], w: Math.round(s[1]), l: Math.round(s[2]) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimate(modules: Module[], settings: Settings): Estimate {
  const matMap = new Map<string, Material>(settings.materials.map((m) => [m.id, m]));
  const cutMap = new Map<string, CutRow>();
  const matArea = new Map<string, number>();
  const hw = new Map<string, number>();
  let edgeMm = 0;
  const perDirect: Record<string, number> = {};
  const waste = 1 + settings.waste / 100;

  for (const m of modules) {
    const built = buildModule(m);
    let direct = 0;
    for (const p of built.parts) {
      if (!p.sheet) continue;
      const id = partMaterialId(p, m);
      const mat = id ? matMap.get(id) : undefined;
      if (!id || !mat) continue;
      const { l, w, t } = partDims(p);
      const area = (l * w) / 1e6;
      matArea.set(id, (matArea.get(id) ?? 0) + area);
      direct += area * (mat.kind === 'top' ? 1.05 : waste) * mat.price;
      edgeMm += p.edgeMm;
      direct += (p.edgeMm / 1000) * settings.edgePrice;

      const key = [m.id, p.name, l, w, t, id].join('|');
      const row = cutMap.get(key);
      if (row) row.qty += 1;
      else
        cutMap.set(key, {
          key, name: p.name, moduleId: m.id, moduleName: m.name, l, w, t, qty: 1, matId: id, matName: mat.name, edgeMm: p.edgeMm,
        });
    }
    for (const [k, q] of Object.entries(built.hardware)) {
      hw.set(k, (hw.get(k) ?? 0) + q);
      const item = settings.hardware[k];
      if (item) direct += q * item.price;
    }
    perDirect[m.id] = direct;
  }

  const materials: Line[] = [];
  let matCost = 0;
  for (const [id, area] of matArea) {
    const mat = matMap.get(id)!;
    const cost = area * (mat.kind === 'top' ? 1.05 : waste) * mat.price;
    matCost += cost;
    materials.push({ key: id, name: mat.name, unit: 'м²', qty: r2(area * (mat.kind === 'top' ? 1.05 : waste)), cost });
  }
  materials.sort((a, b) => b.cost - a.cost);

  const edge: Line = {
    key: 'edge', name: 'Кромка ПВХ', unit: 'м', qty: r2(edgeMm / 1000), cost: (edgeMm / 1000) * settings.edgePrice,
  };

  const hardware: Line[] = [];
  let hwCost = 0;
  for (const [k, q] of hw) {
    const item = settings.hardware[k];
    if (!item) continue;
    const qty = k === 'rod' ? r2(q) : Math.ceil(q);
    const cost = q * item.price;
    hwCost += cost;
    hardware.push({ key: k, name: item.name, unit: item.unit, qty, cost });
  }
  hardware.sort((a, b) => b.cost - a.cost);

  const direct = matCost + edge.cost + hwCost;
  const L = settings.labor;
  const labor: Line[] = [
    { key: 'shop', name: `Цех (${L.shop}%)`, unit: '%', qty: L.shop, cost: (direct * L.shop) / 100 },
    { key: 'assembly', name: `Сборка (${L.assembly}%)`, unit: '%', qty: L.assembly, cost: (direct * L.assembly) / 100 },
    { key: 'tech', name: `Технолог (${L.tech}%)`, unit: '%', qty: L.tech, cost: (direct * L.tech) / 100 },
    { key: 'logistics', name: `Логистика (${L.logistics}%)`, unit: '%', qty: L.logistics, cost: (direct * L.logistics) / 100 },
  ];
  const laborTotal = labor.reduce((s, x) => s + x.cost, 0);
  const markup = ((direct + laborTotal) * L.markup) / 100;
  const total = direct + laborTotal + markup;

  const factor = direct > 0 ? total / direct : 0;
  const perModule: Record<string, number> = {};
  for (const [id, v] of Object.entries(perDirect)) perModule[id] = v * factor;

  const area = [...matArea.values()].reduce((a, b) => a + b, 0);
  const cut = [...cutMap.values()];

  return { cut, materials, edge, hardware, labor, direct, laborTotal, markup, total, perModule, area };
}

export function cutListCsv(rows: CutRow[]): string {
  const esc = (v: string | number) => {
    let s = String(v);
    // защита от CSV-инъекций в Excel
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['№', 'Модуль', 'Деталь', 'Длина, мм', 'Ширина, мм', 'Толщина, мм', 'Кол-во', 'Материал', 'Кромка, мм (на деталь)'];
  const lines = [head.join(';')];
  rows.forEach((r, i) => {
    lines.push([i + 1, r.moduleName, r.name, r.l, r.w, r.t, r.qty, r.matName, Math.round(r.edgeMm)].map(esc).join(';'));
  });
  return '\uFEFF' + lines.join('\r\n');
}
