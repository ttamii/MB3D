/**
 * Смоук-тест ядра конструктора (без браузера): геометрия, нормализация, мастер кухни, смета.
 * Запуск: npm run check
 */
import { DEFAULT_SETTINGS, PRESETS } from '../src/core/defaults';
import { estimate } from '../src/core/estimate';
import { buildModule } from '../src/core/geometry';
import { generateKitchenLayout } from '../src/core/kitchenWizard';
import { DEFAULT_ROOM } from '../src/core/room';
import type { Module } from '../src/core/types';
import { normalizeModule, normalizeProject } from '../src/core/validate';

let failed = 0;
const ok = (cond: boolean, msg: string): void => {
  if (!cond) { failed++; console.error('  FAIL  ' + msg); }
};
const group = (name: string): void => console.log('• ' + name);
const mats = DEFAULT_SETTINGS.materials;

function bounds(m: Module): string[] {
  const errs: string[] = [];
  const b = buildModule(m);
  const corner = m.kind === 'corner' || m.kind === 'cornerWall';
  const maxZ = (corner ? m.w : m.d) + 40;
  const maxX = m.w + (corner ? 40 : 0);
  b.parts.forEach((p) => {
    const [x, y, z] = p.pos;
    const [sx, sy, sz] = p.size;
    if (![x, y, z, sx, sy, sz].every(Number.isFinite)) errs.push(`${p.name}: NaN`);
    if (sx <= 0 || sy <= 0 || sz <= 0) errs.push(`${p.name}: нулевой размер`);
    const tol = 2.5;
    if (p.anim?.type === 'sliding') return;
    if (x < -tol || x + sx > maxX + tol) errs.push(`${p.name}: выход по X (${x}..${x + sx} при W=${m.w})`);
    if (y < -tol || y + sy > m.h + (m.countertop ? 40 : 0) + tol) errs.push(`${p.name}: выход по Y (${y}..${y + sy} при H=${m.h})`);
    if (z < -tol || z + sz > maxZ + tol) errs.push(`${p.name}: выход по Z`);
  });
  return errs;
}

// 1. Все пресеты
group('Пресеты: геометрия в габаритах модуля');
for (const pr of PRESETS) {
  const m = normalizeModule(pr.make(), mats);
  bounds(m).forEach((e) => ok(false, `${pr.id}: ${e}`));
}

// 2. Ящики
group('3 ящика: фасады закрывают всю высоту корпуса');
{
  const base = normalizeModule({
    ...PRESETS.find((p) => p.make().kind === 'base')!.make(),
    sections: [{ shelves: 0, drawers: 3, rods: 0, rod: false, door: false }], doorMode: 'none', drawerH: 240, plinth: 100, h: 820, countertop: true,
  }, mats);
  const fac = buildModule(base).parts.filter((p) => /Ящик \d: фасад/.test(p.name)).sort((a, b) => a.pos[1] - b.pos[1]);
  ok(fac.length === 3, 'должно быть 3 фасада, а их ' + fac.length);
  if (fac.length === 3) {
    const top = fac[2].pos[1] + fac[2].size[1];
    ok(Math.abs(top - (base.h - 3)) <= 4, `верх фасада ${top} вместо ~${base.h - 3}`);
    ok(fac[1].pos[1] - (fac[0].pos[1] + fac[0].size[1]) >= 2 && fac[1].pos[1] - (fac[0].pos[1] + fac[0].size[1]) <= 4, 'зазор между фасадами 2–4 мм');
  }
  bounds(base).forEach((e) => ok(false, e));
}
group('Ниша под духовку: ящик остаётся низким, над ним ниша');
{
  const m = normalizeModule({
    ...PRESETS.find((p) => p.make().kind === 'base')!.make(),
    sections: [{ shelves: 1, drawers: 1, rods: 0, rod: false, door: false }], doorMode: 'none', drawerH: 160, plinth: 100, h: 820,
  }, mats);
  const f = buildModule(m).parts.find((p) => /Ящик: фасад/.test(p.name));
  ok(!!f && f.size[1] < 200, 'фасад ящика должен быть ~160 мм, а он ' + f?.size[1]);
}

// 3. Штанги
group('Штанги 0/1/2 + полки');
for (const rods of [0, 1, 2]) for (const shelves of [0, 1, 2, 4]) {
  const m = normalizeModule({
    ...PRESETS.find((p) => p.make().kind === 'wardrobe')!.make(),
    w: 1000, h: 2400, sections: [{ shelves, drawers: 0, rods, door: true }],
  }, mats);
  const b = buildModule(m);
  const rodParts = b.parts.filter((p) => p.name.startsWith('Штанга'));
  ok(rodParts.length === rods, `rods=${rods}/shelves=${shelves}: штанг в геометрии ${rodParts.length}`);
  rodParts.forEach((r) => ok(r.pos[1] > m.plinth && r.pos[1] < m.h, `штанга вне корпуса y=${r.pos[1]}`));
  bounds(m).forEach((e) => ok(false, `rods=${rods}/shelves=${shelves}: ${e}`));
}

// 4. Нормализация сохраняет данные
group('normalizeModule/Project: milling, plinthColor, room не теряются');
{
  const m = normalizeModule({ ...PRESETS[0].make(), milling: 'frame', plinthColor: 'facade' }, mats);
  ok(m.milling === 'frame', 'milling потерян');
  ok(m.plinthColor === 'facade', 'plinthColor потерян');
  const room = { ...DEFAULT_ROOM, windows: [{ id: 'w1', wall: 'right', x: 500, w: 1000, h: 1200, lift: 900 }], doors: [{ id: 'd1', wall: 'back', x: 300, w: 900, h: 2100, swing: 'out' }] };
  const p = normalizeProject({ modules: [m], room }, mats);
  ok(p?.room?.windows[0]?.wall === 'right', 'окно на правой стене потеряно');
  ok(p?.room?.doors[0]?.wall === 'back' && p?.room?.doors[0]?.swing === 'out', 'дверь на задней стене потеряна');
  const evil = normalizeProject({ modules: [], room: { w: 1e9, d: -5, windows: [{ wall: 'x', x: 1e9, w: 99999 }] } }, mats);
  ok(!!evil?.room && evil.room.w <= 12000 && evil.room.d >= 1500, 'границы комнаты не ограничены');
  ok(evil?.room?.windows[0]?.wall === 'back' && evil.room.windows[0].w <= 3000, 'некорректное окно не санировано');
}

// 5. Мастер кухни
group('Мастер кухни: ширины, пересечения, стили, смета');
for (const len of [1600, 2200, 2400, 3000, 3600, 4200, 6000]) for (const variant of [0, 1, 2]) for (const tiers of [2, 3] as const) {
  const mods = generateKitchenLayout({ wallLength: len, tiers, facadeMat: 'm-ral1015', corpusMat: 'eg-w1000', topMat: 'top-f812', plinthColor: 'facade', millingMix: 'trend', layoutVariant: variant });
  const norm = mods.map((m) => normalizeModule(m, mats));
  const tag = `L=${len} v=${variant} t=${tiers}`;
  // стиль фрезеровки пережил нормализацию
  ok(norm.some((m) => m.milling === 'frame') && norm.some((m) => m.milling === 'ribbed' || tiers === 2), `${tag}: микс фрезеровки потерян`);
  // ряд низа
  const low = norm.filter((m) => m.kind === 'base' || m.kind === 'tall').sort((a, b) => a.x - b.x);
  const totalLow = low.reduce((s, m) => s + m.w, 0);
  ok(Math.abs(totalLow - Math.max(1600, len)) <= 1, `${tag}: сумма ширин низа ${totalLow} ≠ ${len}`);
  for (let i = 1; i < low.length; i++) ok(Math.abs(low[i].x - (low[i - 1].x + low[i - 1].w)) <= 1, `${tag}: зазор/наложение между модулями низа`);
  // модули не выходят за размеры после normalize
  norm.forEach((m, i) => ok(m.w === mods[i].w && m.h === mods[i].h, `${tag}: ${m.name} изменён normalize (${mods[i].w}x${mods[i].h} → ${m.w}x${m.h})`));
  // ширина < 300 — нетехнологично
  norm.forEach((m) => ok(m.w >= 300, `${tag}: ${m.name} уже 300 мм (${m.w})`));
  norm.forEach((m) => bounds(m).forEach((e) => ok(false, `${tag}: ${m.name}: ${e}`)));
  const est = estimate(norm, DEFAULT_SETTINGS);
  ok(Number.isFinite(est.total) && est.total > 0, `${tag}: смета NaN/0`);
}

console.log(failed ? `\n${failed} проверок не пройдено` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
