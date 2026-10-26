import { KIND_LABEL, LIMITS, PRESETS, PRESET_GROUPS, isCorner, isWall } from '../core/defaults';
import type { Estimate } from '../core/estimate';
import { buildModule } from '../core/geometry';
import type { DoorMode, MatKind, Module, Section } from '../core/types';
import { fmtNum, money, uid } from '../core/util';
import type { Store } from '../app/store';
import { clear, h, icon } from './dom';

// ——— поля ввода ———

function numField(
  label: string, fkey: string, value: number, [min, max]: readonly [number, number],
  onCommit: (v: number) => void, unit = 'мм', step = 10,
): HTMLElement {
  const input = h('input', {
    type: 'number', inputmode: 'numeric', min, max, step, value: String(value), 'data-f': fkey, id: `f-${fkey}`,
    onInput: (e: Event) => {
      const v = (e.target as HTMLInputElement).valueAsNumber;
      if (Number.isFinite(v) && v >= min && v <= max) onCommit(Math.round(v));
    },
    onChange: (e: Event) => {
      const el = e.target as HTMLInputElement;
      const v = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : value;
      const c = Math.min(max, Math.max(min, Math.round(v)));
      el.value = String(c);
      onCommit(c);
    },
  });
  return h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, label), h('span', { class: 'fld-i' }, input, h('i', null, unit)));
}

function stepper(label: string, fkey: string, value: number, [min, max]: readonly [number, number], onChange: (v: number) => void): HTMLElement {
  const btn = (d: number, sign: string, aria: string) =>
    h('button', {
      type: 'button', class: 'step-b', 'aria-label': aria, disabled: d < 0 ? value <= min : value >= max,
      onClick: () => onChange(Math.min(max, Math.max(min, value + d))),
    }, sign);
  return h('div', { class: 'stp' }, h('span', { class: 'fld-l' }, label), h('span', { class: 'stp-c', 'data-f': fkey }, btn(-1, '−', `${label}: меньше`), h('b', null, String(value)), btn(1, '+', `${label}: больше`)));
}

function toggle(label: string, fkey: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  return h('label', { class: 'tgl' },
    h('input', { type: 'checkbox', checked, 'data-f': fkey, onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
    h('span', { class: 'tgl-s' }), h('span', { class: 'tgl-t' }, label));
}

function segmented<T extends string | number>(label: string, opts: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  return h('div', { class: 'seg-wrap' },
    h('span', { class: 'fld-l' }, label),
    h('div', { class: 'seg', role: 'group', 'aria-label': label },
      ...opts.map(([v, t]) => h('button', { type: 'button', class: 'seg-b' + (v === value ? ' on' : ''), 'aria-pressed': String(v === value), onClick: () => onChange(v) }, t))));
}

function selectField(
  label: string, fkey: string, opts: { id: string; name: string; category?: string }[],
  value: string, onChange: (v: string) => void,
): HTMLElement {
  const sel = h('select', { 'data-f': fkey, onChange: (e: Event) => onChange((e.target as HTMLSelectElement).value) });
  const groups = new Map<string, { id: string; name: string }[]>();
  opts.forEach((o) => {
    const cat = o.category || '';
    const arr = groups.get(cat) ?? [];
    arr.push(o);
    groups.set(cat, arr);
  });

  if (groups.size <= 1) {
    opts.forEach((o) => sel.append(h('option', { value: o.id, selected: o.id === value }, o.name)));
  } else {
    groups.forEach((items, cat) => {
      if (cat) {
        const og = document.createElement('optgroup');
        og.label = cat;
        items.forEach((o) => og.append(h('option', { value: o.id, selected: o.id === value }, o.name)));
        sel.append(og);
      } else {
        items.forEach((o) => sel.append(h('option', { value: o.id, selected: o.id === value }, o.name)));
      }
    });
  }
  return h('label', { class: 'fld wide' }, h('span', { class: 'fld-l' }, label), sel);
}

// ——— список модулей ———

const openGroups = new Set<string>(['kitchen']);

export function renderModules(root: HTMLElement, store: Store, est: Estimate): void {
  const keepScroll = root.scrollTop;
  clear(root);
  const mods = store.project.modules;

  const overlaps = new Set<string>();
  for (let i = 0; i < mods.length; i++) {
    for (let j = i + 1; j < mods.length; j++) {
      const a = mods[i], b = mods[j];
      const aw = buildModule(a).width, bw = buildModule(b).width;
      const xOverlap = a.x < b.x + bw - 1 && b.x < a.x + aw - 1;
      if (!xOverlap) continue;

      const aY0 = a.lift;
      const aY1 = a.lift + a.h;
      const bY0 = b.lift;
      const bY1 = b.lift + b.h;
      const yOverlap = aY0 < bY1 - 2 && bY0 < aY1 - 2;

      if (yOverlap) {
        overlaps.add(a.id);
        overlaps.add(b.id);
      }
    }
  }

  const list = h('ul', { class: 'mod-list', role: 'listbox', 'aria-label': 'Модули проекта' });
  mods.forEach((m, i) => {
    const on = m.id === store.selectedId;
    list.append(h('li', {
      class: 'mod' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on), tabindex: '0',
      onClick: () => store.select(m.id),
      onKeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); store.select(m.id); } },
    },
      h('div', { class: 'mod-top' },
        h('span', { class: 'mod-name' }, m.name),
        h('span', { class: 'mod-price' }, money(est.perModule[m.id] ?? 0))),
      h('div', { class: 'mod-sub' }, `${KIND_LABEL[m.kind]} · ${m.w}×${m.h}×${m.d}`,
        overlaps.has(m.id) ? h('em', { class: 'warn', title: 'Модуль пересекается с соседним — измените позицию X или нажмите «Выстроить в ряд»' }, 'пересечение') : null),
      h('div', { class: 'mod-act' },
        h('button', { type: 'button', class: 'ib', title: 'Выше в списке', 'aria-label': 'Выше', disabled: i === 0, onClick: (e: Event) => { e.stopPropagation(); store.move(m.id, -1); } }, icon('up', 16)),
        h('button', { type: 'button', class: 'ib', title: 'Ниже в списке', 'aria-label': 'Ниже', disabled: i === mods.length - 1, onClick: (e: Event) => { e.stopPropagation(); store.move(m.id, 1); } }, icon('down', 16)),
        h('button', { type: 'button', class: 'ib', title: 'Дублировать', 'aria-label': 'Дублировать', onClick: (e: Event) => { e.stopPropagation(); store.duplicate(m.id); } }, icon('copy', 16)),
        h('button', { type: 'button', class: 'ib danger', title: 'Удалить', 'aria-label': 'Удалить', onClick: (e: Event) => { e.stopPropagation(); store.remove(m.id); } }, icon('trash', 16)))));
  });

  const head = h('div', { class: 'sec-h' }, h('h2', null, 'Модули'),
    h('button', { type: 'button', class: 'btn sm ghost', disabled: mods.length < 2, onClick: () => store.autoLayout(), title: 'Расставить нижние и верхние модули подряд, без зазоров' }, icon('rows', 15), 'В ряд'));

  const groupSections = PRESET_GROUPS.map((g) => {
    const items = g.ids.map((id) => PRESETS.find((p) => p.id === id)).filter((p): p is (typeof PRESETS)[number] => !!p);
    const det = h('details', { class: 'lib-group' },
      h('summary', null, g.label, h('small', null, String(items.length))),
      h('div', { class: 'lib-grid' },
        ...items.map((p) => h('button', { type: 'button', class: 'lib-b', onClick: () => store.addPreset(p.id) },
          h('span', { class: 'lib-ic' }, icon('plus', 14)), h('b', null, p.label), h('small', null, p.hint)))));
    if (openGroups.has(g.id)) det.setAttribute('open', '');
    det.addEventListener('toggle', () => { if ((det as HTMLDetailsElement).open) openGroups.add(g.id); else openGroups.delete(g.id); });
    return det;
  });
  const lib = h('div', { class: 'lib' }, h('h2', null, 'Добавить в проект'), ...groupSections);

  root.append(head, mods.length ? list : h('p', { class: 'empty' }, 'Проект пуст. Добавьте первый модуль из библиотеки ниже.'), lib);
  root.scrollTop = keepScroll;
}

// ——— свойства модуля ———

let activePropTab: 'dims' | 'secs' | 'facades' | 'mats' = 'dims';

export function renderProps(root: HTMLElement, store: Store): void {
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active && root.contains(active) ? active.getAttribute('data-f') : undefined;
  const typed = active instanceof HTMLInputElement && active.type === 'number' ? { v: active.valueAsNumber, t: Date.now() } : undefined;
  const keepScroll = root.scrollTop;
  clear(root);
  const m = store.selected;
  if (!m) {
    root.append(h('div', { class: 'empty' }, 'Выберите модуль в списке слева или кликните по мебели в 3D'));
    return;
  }

  const set = (fn: (m: Module) => void, tag?: string) => {
    store.commit((p) => {
      const cur = p.modules.find((x) => x.id === m.id);
      if (cur) fn(cur);
    }, tag);
  };

  const corner = isCorner(m.kind);
  const wall = isWall(m.kind);
  const canSlide = m.kind === 'wardrobe';
  const matOpts = (k: MatKind) => store.settings.materials.filter((x) => x.kind === k);

  // Верхняя шапка модуля с быстрым удалением и дублированием
  const topHeader = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;' },
    h('div', { style: 'display:flex; align-items:center; gap:8px;' },
      h('h2', { style: 'font-size:15px; font-weight:700; margin:0;' }, m.name),
      h('span', { class: 'chip' }, KIND_LABEL[m.kind]),
    ),
    h('div', { style: 'display:flex; gap:4px;' },
      h('button', {
        type: 'button', class: 'ib sm', title: 'Дублировать модуль (Ctrl+D)',
        onClick: () => {
          const copy = JSON.parse(JSON.stringify(m)) as Module;
          copy.id = uid();
          copy.name = `${m.name} (копия)`;
          copy.x = m.x + m.w;
          store.commit((p) => { p.modules.push(copy); }, 'dup');
          store.select(copy.id);
        },
      }, icon('copy', 15)),
      h('button', {
        type: 'button', class: 'ib sm danger', title: 'Удалить модуль (Del)',
        onClick: () => store.remove(m.id),
      }, icon('trash', 15)),
    ),
  );

  // Табы группировки
  const tabsBar = h('div', { class: 'seg', style: 'margin-bottom:12px; width:100%;' },
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'dims' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'dims'; renderProps(root, store); },
    }, 'Размеры'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'secs' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'secs'; renderProps(root, store); },
    }, 'Наполнение'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'facades' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'facades'; renderProps(root, store); },
    }, 'Фасады'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'mats' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'mats'; renderProps(root, store); },
    }, 'Материалы'),
  );

  const contentArea = h('div', { style: 'display:flex; flex-direction:column; gap:12px;' });

  if (activePropTab === 'dims') {
    // Вкладка 1: Размеры, позиция и стыковка
    const sameTier = (o: Module) => {
      if (isWall(m.kind)) {
        return isWall(o.kind) && Math.abs(o.lift - m.lift) < 300;
      }
      return !isWall(o.kind) || o.kind === 'tall';
    };
    const otherMods = store.project.modules.filter((x) => x.id !== m.id && sameTier(x));
    const leftNeighbor = otherMods
      .filter((x) => x.x + x.w <= m.x + 5)
      .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    const rightNeighbor = otherMods
      .filter((x) => x.x >= m.x + m.w - 5)
      .sort((a, b) => a.x - b.x)[0];

    const nameField = h('label', { class: 'fld wide' },
      h('span', { class: 'fld-l' }, 'Название модуля'),
      h('input', {
        type: 'text', maxlength: '60', value: m.name, 'data-f': 'name',
        onInput: (e: Event) => set((t) => { t.name = (e.target as HTMLInputElement).value; }, 'name'),
      }),
    );

    const dimsGrid = h('div', { class: 'grid2' },
      numField(corner ? 'Сторона (ширина)' : 'Ширина', 'w', m.w, LIMITS.w, (v) => set((t) => { t.w = v; }, 'w')),
      numField('Высота', 'h', m.h, LIMITS.h, (v) => set((t) => { t.h = v; }, 'h')),
      numField(corner ? 'Глубина плеча' : 'Глубина', 'd', m.d, LIMITS.d, (v) => set((t) => { t.d = v; }, 'd')),
      wall ? numField('Высота от пола', 'lift', m.lift, LIMITS.lift, (v) => set((t) => { t.lift = v; }, 'lift'))
        : numField('Цоколь', 'plinth', m.plinth, LIMITS.plinth, (v) => set((t) => { t.plinth = v; }, 'plinth')),
      numField('Позиция X (вдоль стены)', 'x', m.x, LIMITS.x, (v) => set((t) => { t.x = v; }, 'x')),
    );

    const snapActions = h('div', { class: 'grp', style: 'padding-top:8px;' },
      h('span', { class: 'fld-l' }, 'Стыковка модулей без щелей:'),
      h('div', { class: 'btn-bar', style: 'margin-top:4px;' },
        h('button', {
          class: 'btn btn-ghost sm',
          disabled: !leftNeighbor,
          title: leftNeighbor ? `Пристыковать вплотную к "${leftNeighbor.name}" слева` : 'Нет соседа слева',
          onClick: () => { if (leftNeighbor) set((t) => { t.x = leftNeighbor.x + leftNeighbor.w; }, 'snap'); },
        }, 'Стыковать влево'),
        h('button', {
          class: 'btn btn-ghost sm',
          disabled: !rightNeighbor,
          title: rightNeighbor ? `Пристыковать вплотную к "${rightNeighbor.name}" справа` : 'Нет соседа справа',
          onClick: () => { if (rightNeighbor) set((t) => { t.x = rightNeighbor.x - t.w; }, 'snap'); },
        }, 'Стыковать вправо'),
      ),
    );

    const advanced = h('details', { class: 'more' },
      h('summary', null, 'Дополнительно'),
      h('div', { style: 'display:flex; flex-direction:column; gap:10px; padding-top:8px;' },
        segmented('Толщина ЛДСП', [[16, '16 мм'], [18, '18 мм']] as [number, string][], m.t, (v) => set((t) => { t.t = v === 18 ? 18 : 16; })),
        toggle('Зеркально (отразить по горизонтали)', 'mirror', m.mirror, (v) => set((t) => { t.mirror = v; })),
        snapActions,
      ),
    );
    if (m.t !== 16 || m.mirror) advanced.setAttribute('open', '');

    contentArea.append(nameField, dimsGrid, advanced);

  } else if (activePropTab === 'secs') {
    // Вкладка 2: Внутреннее наполнение
    const maxSec = Math.max(1, Math.floor((m.w - m.t) / (150 + m.t)));
    const presetsWrap = h('div', { class: 'grp', style: 'border-top:0; padding-top:0;' },
      h('span', { class: 'fld-l', style: 'margin-bottom:6px;' }, 'Быстрый шаблон шкафа:'),
      h('div', { class: 'btn-bar', style: 'flex-wrap:wrap; gap:6px;' },
        h('button', {
          class: 'btn btn-ghost sm',
          onClick: () => set((t) => {
            t.sections = [{ shelves: 0, drawers: 0, rods: 0, rod: false, door: true }];
            t.doorMode = 'hinged';
          }),
        }, 'Мойка'),
        h('button', {
          class: 'btn btn-ghost sm',
          onClick: () => set((t) => {
            t.sections = [{ shelves: 1, drawers: 1, rods: 0, rod: false, door: false }];
            t.doorMode = 'none';
            t.drawerH = 160;
          }),
        }, 'Духовой шкаф'),
        h('button', {
          class: 'btn btn-ghost sm',
          onClick: () => set((t) => {
            t.sections = [{ shelves: 0, drawers: 3, rods: 0, rod: false, door: false }];
            t.doorMode = 'none';
            t.drawerH = Math.round((t.h - (t.plinth ?? 100)) / 3);
          }),
        }, '3 выдвижных ящика'),
        h('button', {
          class: 'btn btn-ghost sm',
          onClick: () => set((t) => {
            t.sections = [{ shelves: 2, drawers: 0, rods: 2, rod: true, door: true }];
            t.doorMode = 'hinged';
          }),
        }, '2 штанги + 2 полки'),
        h('button', {
          class: 'btn btn-ghost sm',
          onClick: () => set((t) => {
            t.sections = [{ shelves: 3, drawers: 0, rods: 0, rod: false, door: true }];
            t.doorMode = 'hinged';
          }),
        }, 'Полки'),
      ),
    );

    const sectionsList = h('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
    if (!corner) {
      sectionsList.append(stepper('Количество секций', 'secN', m.sections.length, [1, Math.min(5, maxSec)], (v) =>
        set((t) => {
          while (t.sections.length < v) t.sections.push({ shelves: 2, drawers: 0, rods: 0, rod: false, door: true });
          t.sections.length = v;
        })));
    }

    m.sections.forEach((s, i) => {
      const upd = (fn: (s: Section) => void) => set((t) => fn(t.sections[i]));
      sectionsList.append(h('div', { class: 'sec-card' },
        corner ? null : h('div', { class: 'sec-t' }, `Секция ${i + 1}`),
        h('div', { class: 'grid2' },
          stepper('Полки', `sh${i}`, s.shelves, LIMITS.shelves, (v) => upd((x) => { x.shelves = v; })),
          corner ? null : stepper('Ящики', `dr${i}`, s.drawers, LIMITS.drawers, (v) => upd((x) => { x.drawers = v; })),
        ),
        h('div', { class: 'grid2', style: 'margin-top:6px;' },
          corner ? null : stepper('Штанги', `rd${i}`, typeof s.rods === 'number' ? s.rods : (s.rod ? 1 : 0), LIMITS.rods, (v) => upd((x) => { x.rods = v; x.rod = v > 0; })),
          toggle('Фасадная дверца', `door${i}`, s.door, (v) => upd((x) => { x.door = v; })),
        ),
      ));
    });

    contentArea.append(presetsWrap, sectionsList);

  } else if (activePropTab === 'facades') {
    // Вкладка 3: Фасады и ручки
    const doorOpts: [DoorMode, string][] = [['none', 'Открытый'], ['hinged', 'Распашные']];
    if (canSlide) doorOpts.push(['sliding', 'Купе']);

    const facadeNodes: HTMLElement[] = [
      segmented('Тип дверей', doorOpts, m.doorMode, (v) => set((t) => { t.doorMode = v; })),
    ];
    if (m.doorMode === 'hinged') {
      if (m.sections.length === 1) {
        const curHinge = m.hinge ?? 'left';
        facadeNodes.push(
          segmented('Сторона петель (открывание)', [
            ['left', 'Слева (ручка справа)'],
            ['right', 'Справа (ручка слева)'],
          ], curHinge, (v) => set((t) => { t.hinge = v as 'left' | 'right'; })),
        );
      } else {
        facadeNodes.push(
          toggle('Отзеркалить открывание дверей', 'mirror', m.mirror, (v) => set((t) => { t.mirror = v; })),
        );
      }
    }
    if (m.doorMode === 'sliding') facadeNodes.push(stepper('Количество дверей купе', 'slide', m.slidingCount, LIMITS.sliding, (v) => set((t) => { t.slidingCount = v; })));
    if (!corner && m.sections.some((s) => s.drawers > 0)) facadeNodes.push(numField('Высота фасада ящика', 'drh', m.drawerH, LIMITS.drawerH, (v) => set((t) => { t.drawerH = v; }, 'drh')));
    facadeNodes.push(
      segmented('Фрезеровка фасада', [
        ['modern', 'Модерн (гладкий)'],
        ['frame', 'Рамка (классика)'],
        ['ribbed', 'Рифлёный (вельвет)'],
      ], m.milling ?? 'modern', (v) => set((t) => { t.milling = v; })),
    );
    if (!wall) {
      facadeNodes.push(segmented('Цоколь снизу', [
        ['facade', 'В тон фасадов'],
        ['corpus', 'В тон корпуса'],
        ['black', 'Чёрный'],
      ], m.plinthColor ?? 'facade', (v) => set((t) => { t.plinthColor = v; })));
    }
    facadeNodes.push(toggle('Лицевые ручки', 'handles', m.handles, (v) => set((t) => { t.handles = v; })));
    if (m.kind === 'base' || m.kind === 'corner') {
      facadeNodes.push(toggle('Столешница 38 мм', 'top', m.countertop, (v) => set((t) => { t.countertop = v; })));
    }
    contentArea.append(...facadeNodes);

  } else if (activePropTab === 'mats') {
    // Вкладка 4: Цвета и декоры
    const matNodes: HTMLElement[] = [
      selectField('ЛДСП Корпуса', 'mc', matOpts('sheet'), m.matCorpus, (v) => set((t) => { t.matCorpus = v; })),
      selectField('МДФ Фасадов', 'mf', matOpts('facade'), m.matFacade, (v) => set((t) => { t.matFacade = v; })),
      selectField('ХДФ Задней стенки', 'mb', matOpts('back'), m.matBack, (v) => set((t) => { t.matBack = v; })),
    ];
    if (m.countertop) {
      matNodes.push(selectField('Столешница', 'mt', matOpts('top'), m.matTop, (v) => set((t) => { t.matTop = v; })));
    }
    contentArea.append(...matNodes);
  }

  const info = buildModule(m);
  const stat = h('p', { class: 'hint', style: 'margin-top:10px;' },
    `Деталей в раскрое: ${info.parts.filter((p) => p.sheet).length} шт · Габариты: ${fmtNum(info.width, 0)}×${fmtNum(info.height, 0)}×${fmtNum(info.depth, 0)} мм`,
  );

  root.append(topHeader, tabsBar, contentArea, stat);
  root.scrollTop = keepScroll;

  if (focusKey) {
    const el = root.querySelector<HTMLElement>(`[data-f="${focusKey}"]`);
    const target = el instanceof HTMLElement && el.classList.contains('stp-c') ? el.querySelector<HTMLElement>('button:not(:disabled)') : el;
    if (target) {
      target.focus({ preventScroll: true });
      if (typed && target instanceof HTMLInputElement && target.type === 'number') {
        target.value = String(typed.v);
      } else if (target instanceof HTMLInputElement && target.type === 'text') {
        try { target.setSelectionRange(target.value.length, target.value.length); } catch { /* ignore */ }
      }
    }
  }
}
