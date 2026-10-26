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

group('Составные пресеты: модули не пересекаются');
for (const p of PRESETS.filter((x) => x.group)) {
  const mods = p.group!();
  for (let i = 0; i < mods.length; i++) for (let j = i + 1; j < mods.length; j++) {
    const a = mods[i], b = mods[j];
    const overlap = a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.lift < b.lift + b.h - 1 && a.lift + a.h > b.lift + 1;
    ok(!overlap, `${p.label}: ${a.name} пересекается с ${b.name}`);
  }
}

group('Мастер кухни в комнате: окна, двери, потолок, наложения');
{
  const rooms = [
    { name: 'окно сзади', room: { ...DEFAULT_ROOM, windows: [{ id: 'w', wall: 'back' as const, x: 1250, w: 1200, h: 1400, lift: 900 }], doors: [] } },
    { name: 'дверь сзади', room: { ...DEFAULT_ROOM, windows: [], doors: [{ id: 'd', wall: 'back' as const, x: 2000, w: 900, h: 2100, swing: 'in' as const }] } },
    { name: 'дверь слева у угла', room: { ...DEFAULT_ROOM, windows: [], doors: [{ id: 'd', wall: 'left' as const, x: 100, w: 800, h: 2100, swing: 'in' as const }] } },
    { name: 'потолок 2500', room: { ...DEFAULT_ROOM, h: 2500, windows: [], doors: [] } },
    { name: 'комната 3000', room: { ...DEFAULT_ROOM, w: 3000, windows: [], doors: [] } },
  ];
  for (const { name, room } of rooms) for (const variant of [0, 1, 2]) for (const tiers of [2, 3] as const) {
    const tag = `${name} v=${variant} t=${tiers}`;
    const mods = generateKitchenLayout({ wallLength: room.w, tiers, facadeMat: 'm-ral1015', corpusMat: 'eg-w1000', topMat: 'top-f812', plinthColor: 'facade', millingMix: 'trend', layoutVariant: variant }, room);
    ok(mods.length > 0, `${tag}: кухня не построена`);
    mods.forEach((m) => {
      ok(m.x >= 0 && m.x + m.w <= room.w, `${tag}: ${m.name} выходит за стену (${m.x}+${m.w})`);
      ok(m.lift + m.h <= room.h, `${tag}: ${m.name} выше потолка (${m.lift + m.h} > ${room.h})`);
      room.windows.forEach((w) => ok(!(m.x < w.x + w.w && m.x + m.w > w.x && m.lift < w.lift + w.h && m.lift + m.h > w.lift), `${tag}: ${m.name} пересекает окно`));
      room.doors.filter((d) => d.wall === 'back').forEach((d) => ok(!(m.x < d.x + d.w && m.x + m.w > d.x), `${tag}: ${m.name} закрывает дверь`));
      room.doors.filter((d) => d.wall === 'left').forEach((d) => ok(m.x >= d.w, `${tag}: ${m.name} перекрывает левую дверь`));
    });
    for (let i = 0; i < mods.length; i++) for (let j = i + 1; j < mods.length; j++) {
      const a = mods[i], b = mods[j];
      const overlap = a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.lift < b.lift + b.h - 1 && a.lift + a.h > b.lift + 1;
      ok(!overlap, `${tag}: ${a.name} пересекается с ${b.name}`);
    }
  }
}

// 6. Угловая кухня
group('Мастер кухни: угловая кухня (Г-образная)');
for (const len of [2400, 3000, 3600]) for (const variant of [0, 1, 2]) for (const tiers of [2, 3] as const) {
  const tag = `Corner L=${len} v=${variant} t=${tiers}`;
  const mods = generateKitchenLayout({
    wallLength: len, tiers, facadeMat: 'm-ral1015', corpusMat: 'eg-w1000', topMat: 'top-f812',
    plinthColor: 'facade', millingMix: 'trend', layoutVariant: variant, shape: 'corner-left',
  });
  const cornerBase = mods.find((m) => m.kind === 'corner');
  ok(!!cornerBase && cornerBase.x === 0 && cornerBase.w === 900, `${tag}: угловой нижний шкаф 900мм отсутствует в x=0`);
  const cornerUpper = mods.find((m) => m.kind === 'cornerWall');
  ok(!!cornerUpper && cornerUpper.x === 0 && cornerUpper.w === 600, `${tag}: угловой верхний шкаф 600мм отсутствует в x=0`);
  const upper300 = mods.find((m) => m.kind === 'wall' && m.x === 600 && m.w === 300 && m.lift === 1450);
  ok(!!upper300, `${tag}: вставка 300мм на x=600 отсутствует`);

  // Проверяем наложения между модулями
  for (let i = 0; i < mods.length; i++) for (let j = i + 1; j < mods.length; j++) {
    const a = mods[i], b = mods[j];
    const overlap = a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.lift < b.lift + b.h - 1 && a.lift + a.h > b.lift + 1;
    ok(!overlap, `${tag}: ${a.name} пересекается с ${b.name}`);
  }
}

// 7. Карты раскроя (Базис-Раскрой)
group('Карты раскроя (Базис-Раскрой): 2D-гильотинная укладка');
{
  const testMods = generateKitchenLayout({
    wallLength: 3000, tiers: 3, facadeMat: 'm-ral1015', corpusMat: 'eg-w1000', topMat: 'top-f812',
    plinthColor: 'facade', millingMix: 'trend', layoutVariant: 1,
  });
  const est = estimate(testMods, DEFAULT_SETTINGS);
  ok(est.cut.length > 0, 'деталировка пуста');

  const { computeNesting, renderSheetSvg, DEFAULT_SHEET_FORMATS } = await import('../src/core/nesting');
  for (const fmt of DEFAULT_SHEET_FORMATS) {
    const res = computeNesting(est.cut, mats, fmt);
    ok(res.totalSheets > 0, `${fmt.name}: листов 0`);
    ok(res.totalPartsCount > 0, `${fmt.name}: деталей 0`);
    ok(res.overallEfficiencyPercent > 50 && res.overallEfficiencyPercent <= 100, `${fmt.name}: КУМ некорректен ${res.overallEfficiencyPercent}%`);

    res.sheets.forEach((sheet) => {
      ok(sheet.parts.length > 0, `Лист ${sheet.sheetIndex}: нет деталей`);
      ok(sheet.efficiencyPercent > 0 && sheet.efficiencyPercent <= 100, `Лист ${sheet.sheetIndex}: КУМ ${sheet.efficiencyPercent}%`);
      const svg = renderSheetSvg(sheet);
      ok(svg.includes('<svg') && svg.includes('</svg>'), `Лист ${sheet.sheetIndex}: SVG не сформирован`);

      sheet.parts.forEach((p) => {
        ok(p.x >= fmt.margin, `${p.row.name}: x < margin (${p.x})`);
        ok(p.y >= fmt.margin, `${p.row.name}: y < margin (${p.y})`);
        ok(p.x + p.w <= fmt.w - fmt.margin + 0.1, `${p.row.name}: x+w > sheetW`);
        ok(p.y + p.h <= fmt.h - fmt.margin + 0.1, `${p.row.name}: y+h > sheetH`);
      });
    });
  }
}

// 8. AI Конструктор: парсинг и генерация мебели
group('AI Конструктор: NLP-парсинг запросов и геометрия');
{
  const { parseFurniturePrompt } = await import('../src/core/aiConstructor');

  const res1 = parseFurniturePrompt('Шкаф-купе 2400х1800х600 в прихожую с зеркалом, 2 штангами и 4 ящиками');
  ok(res1.module.kind === 'wardrobe', 'тип не wardrobe');
  ok(res1.module.doorMode === 'sliding', 'двери не sliding');
  ok(res1.module.w === 1800 && res1.module.h === 2400 && res1.module.d === 600, `размеры не 1800x2400x600 (${res1.module.w}x${res1.module.h}x${res1.module.d})`);
  ok(res1.module.mirror === true, 'зеркало не включено');
  ok(res1.module.sections.some((s) => s.drawers > 0), 'ящики отсутствуют');
  bounds(normalizeModule(res1.module, mats)).forEach((e) => ok(false, `AI res1: ${e}`));

  const res2 = parseFurniturePrompt('Подвесная тумба ТВ 1800мм на 2 ящика');
  ok(res2.module.kind === 'base', 'тип не base');
  ok(res2.module.w === 1800, 'w != 1800');
  ok(res2.module.lift > 0 && res2.module.plinth === 0, 'не подвесная');
  bounds(normalizeModule(res2.module, mats)).forEach((e) => ok(false, `AI res2: ${e}`));

  const res3 = parseFurniturePrompt('Комод 1000х900х450 на 4 ящика в цвете графит');
  ok(res3.module.w === 1000 && res3.module.h === 900 && res3.module.d === 450, 'размеры комода некорректны');
  ok(res3.module.matFacade === 'eg-u999', 'цвет графит не определен');
  ok(res3.module.sections[0].drawers === 4, 'ящиков не 4');
  bounds(normalizeModule(res3.module, mats)).forEach((e) => ok(false, `AI res3: ${e}`));
}

// 9. Распашные двери: геометрия и открывание от центра
group('Распашные двери: геометрия и открывание от центра');
{
  const p = PRESETS.find((x) => x.id === 'wardrobe-hinged')!;
  const m = p.make();
  const built = buildModule(m);
  const doors = built.parts.filter((pt) => pt.anim?.type === 'door' && pt.mat === 'facade');
  ok(doors.length === 2, `Ожидалось 2 двери, получено ${doors.length}`);

  const leftDoor = doors[0];
  const rightDoor = doors[1];
  ok(leftDoor.anim?.pivot && leftDoor.anim.pivot[0] < 50, `Левая дверь pivot не слева (${leftDoor.anim?.pivot?.[0]})`);
  ok((leftDoor.anim?.ang ?? 0) < 0, `Левая дверь должна распахиваться влево (ang < 0, получено ${leftDoor.anim?.ang})`);

  ok(rightDoor.anim?.pivot && rightDoor.anim.pivot[0] > 1150, `Правая дверь pivot не справа (${rightDoor.anim?.pivot?.[0]})`);
  ok((rightDoor.anim?.ang ?? 0) > 0, `Правая дверь должна распахиваться вправо (ang > 0, получено ${rightDoor.anim?.ang})`);
}

console.log(failed ? `\n${failed} проверок не пройдено` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
