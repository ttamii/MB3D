import { KIND_LABEL, LIMITS, PRESETS, PRESET_GROUPS, isCorner, isWall } from '../core/defaults';
import type { Estimate } from '../core/estimate';
import { buildModule, getTallOvenZones } from '../core/geometry';
import type { DoorMode, Material, MatKind, Module, Section } from '../core/types';
import { fmtNum, money, uid } from '../core/util';
import { applyTopTrimToUpperRow, autoFitBlindZone, getActiveTopTrimH, getCornerClearanceForWall, isSameVerticalTier, resizeHeightWithStack, resizeModuleCascading, shiftModuleCascading, insertFillerWithShift, syncTierDepth, syncTierHeight, verticalOverlap } from '../core/collision';
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

let openMatFieldKey: string | null = 'mf';
const matSearchByKey: Record<string, string> = {};
const matCategoryFilterByKey: Record<string, string> = {};
const collapsedMatSublists = new Set<string>();

function matSwatchStyle(o: Partial<Material>): string {
  const c = o.color ?? '#e2e8f0';
  if (o.grain) {
    return `background: repeating-linear-gradient(90deg, ${c} 0px, ${c} 3px, rgba(0,0,0,0.08) 4px, ${c} 6px);`;
  }
  if (o.stone) {
    return `background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), transparent 60%), ${c};`;
  }
  if (o.gloss) {
    return `background: linear-gradient(135deg, rgba(255,255,255,0.45) 0%, ${c} 48%, ${c} 100%);`;
  }
  return `background: ${c};`;
}

function matFinishBadge(o: Partial<Material>): string {
  if (o.supermat) return 'Супермат';
  if (o.gloss) return 'Глянец';
  if (o.grain) return 'Дерево';
  if (o.stone) return 'Камень';
  return 'Матовый';
}

function selectField(
  label: string, fkey: string, opts: Material[],
  value: string, onChange: (v: string) => void,
): HTMLElement {
  const activeMat = opts.find((o) => o.id === value) ?? opts[0];
  const isOpen = openMatFieldKey === fkey;

  const wrapper = h('div', { class: 'fld wide mat-picker-wrap' });
  const lbl = h('span', { class: 'fld-l' }, `${label} (${opts.length} декоров)`);

  const triggerBtn = h('button', {
    type: 'button',
    class: `mat-pick-trigger ${isOpen ? 'open' : ''}`,
    onClick: () => {
      openMatFieldKey = openMatFieldKey === fkey ? null : fkey;
      renderDrawer();
    },
  },
    h('span', { class: 'mat-swatch lg', style: matSwatchStyle(activeMat ?? {}) }),
    h('span', { class: 'mat-pick-info' },
      h('span', { class: 'mat-pick-name' }, activeMat?.name ?? value),
      h('span', { class: 'mat-pick-meta' }, `${activeMat?.category ?? 'Каталог'} · ${matFinishBadge(activeMat ?? {})} · ${fmtNum(activeMat?.price ?? 0, 0)} ₸/м²`),
    ),
    h('span', { class: 'mat-pick-arrow' }, isOpen ? '▴' : '▾'),
  );

  const drawerHost = h('div', { class: 'mat-drawer-host' });

  const renderDrawer = () => {
    clear(drawerHost);
    const nowOpen = openMatFieldKey === fkey;
    triggerBtn.classList.toggle('open', nowOpen);
    const arrowEl = triggerBtn.querySelector('.mat-pick-arrow');
    if (arrowEl) arrowEl.textContent = nowOpen ? '▴' : '▾';
    if (!nowOpen) return;

    const groups = new Map<string, Material[]>();
    opts.forEach((o) => {
      const cat = o.category || 'Прочие декоры';
      const arr = groups.get(cat) ?? [];
      arr.push(o);
      groups.set(cat, arr);
    });
    const categories = Array.from(groups.keys());

    let curSearch = matSearchByKey[fkey] ?? '';
    let curCat = matCategoryFilterByKey[fkey] ?? 'ALL';
    if (curCat !== 'ALL' && !groups.has(curCat)) curCat = 'ALL';

    const searchInput = h('input', {
      type: 'search',
      class: 'mat-search-in',
      placeholder: 'Поиск по коду или цвету (H1180, дуб, кашемир, RAL...)',
      value: curSearch,
      onInput: (e: Event) => {
        curSearch = (e.target as HTMLInputElement).value;
        matSearchByKey[fkey] = curSearch;
        renderListOnly();
      },
    }) as HTMLInputElement;

    const chipsBar = h('div', { class: 'mat-cat-chips' });
    const renderChips = () => {
      clear(chipsBar);
      chipsBar.append(
        h('button', {
          type: 'button',
          class: `mat-cat-chip ${curCat === 'ALL' ? 'on' : ''}`,
          onClick: () => {
            curCat = 'ALL';
            matCategoryFilterByKey[fkey] = 'ALL';
            renderChips();
            renderListOnly();
          },
        }, `Все (${opts.length})`),
        ...categories.map((cat) => {
          const shortCat = cat
            .replace(/^EGGER\s+/i, '')
            .replace(/^KronoSpan \/ Lamarty\s+/i, 'KronoSpan ')
            .replace(/^Столешницы\s+/i, '');
          return h('button', {
            type: 'button',
            class: `mat-cat-chip ${curCat === cat ? 'on' : ''}`,
            title: cat,
            onClick: () => {
              curCat = cat;
              matCategoryFilterByKey[fkey] = cat;
              renderChips();
              renderListOnly();
            },
          }, `${shortCat} (${groups.get(cat)?.length ?? 0})`);
        }),
      );
    };

    const scrollList = h('div', { class: 'mat-scroll-list' });

    const renderListOnly = () => {
      clear(scrollList);
      const q = curSearch.trim().toLowerCase();
      let totalMatched = 0;

      groups.forEach((items, cat) => {
        if (curCat !== 'ALL' && curCat !== cat) return;
        const filtered = q
          ? items.filter((it) => it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q) || (it.category ?? '').toLowerCase().includes(q))
          : items;
        if (!filtered.length) return;
        totalMatched += filtered.length;

        const subKey = `${fkey}::${cat}`;
        const isSubOpen = q.length > 0 || curCat !== 'ALL' || !collapsedMatSublists.has(subKey);
        const det = h('details', { class: 'mat-sublist', ...(isSubOpen ? { open: '' } : {}) });
        const sum = h('summary', {
          class: 'mat-sublist-head',
          onClick: (e: Event) => {
            e.preventDefault();
            if (det.hasAttribute('open')) {
              det.removeAttribute('open');
              collapsedMatSublists.add(subKey);
            } else {
              det.setAttribute('open', '');
              collapsedMatSublists.delete(subKey);
            }
          },
        },
          h('span', { class: 'mat-sublist-title' }, cat),
          h('span', { class: 'mat-sublist-cnt' }, `${filtered.length}`),
        );

        const itemsBox = h('div', { class: 'mat-sublist-items' },
          ...filtered.map((item) => {
            const selected = item.id === value;
            return h('button', {
              type: 'button',
              class: `mat-option-row ${selected ? 'on' : ''}`,
              onClick: () => {
                onChange(item.id);
              },
            },
              h('span', { class: 'mat-swatch', style: matSwatchStyle(item) }),
              h('span', { class: 'mat-opt-main' },
                h('span', { class: 'mat-opt-name' }, item.name),
                h('span', { class: 'mat-opt-sub' }, `${matFinishBadge(item)} · ${fmtNum(item.price, 0)} ₸/м²`),
              ),
              selected ? h('span', { class: 'mat-opt-check' }, '✓') : null,
            );
          }),
        );

        det.append(sum, itemsBox);
        scrollList.append(det);
      });

      if (totalMatched === 0) {
        scrollList.append(h('div', { class: 'mat-empty' }, 'По вашему запросу декоров не найдено.'));
      }
    };

    renderChips();
    renderListOnly();

    const drawerBox = h('div', { class: 'mat-catalog-box' },
      searchInput,
      chipsBar,
      scrollList,
    );
    drawerHost.append(drawerBox);
  };

  renderDrawer();
  wrapper.append(lbl, triggerBtn, drawerHost);
  return wrapper;
}

// ——— список модулей (CAD Outliner + Каталог) ———

const openGroups = new Set<string>(['corners', 'kitchen']);
let leftViewMode: 'split' | 'tree' | 'catalog' = 'split';

export function renderModules(root: HTMLElement, store: Store, est: Estimate): void {
  const keepScroll = root.scrollTop;
  clear(root);
  const mods = store.project.modules;
  const roomW = store.project.room?.w ?? 4500;

  const overlaps = new Set<string>();
  for (let i = 0; i < mods.length; i++) {
    const a = mods[i];
    const aWall = a.wall ?? 'back';
    const { minStart } = getCornerClearanceForWall(mods, aWall, a.lift ?? 0, (a.lift ?? 0) + a.h, roomW, a.id);
    if (a.x < minStart - 2) overlaps.add(a.id);

    for (let j = i + 1; j < mods.length; j++) {
      const b = mods[j];
      if ((a.wall ?? 'back') !== (b.wall ?? 'back')) continue;
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

  const cntBack = mods.filter((m) => (m.wall ?? 'back') === 'back').length;
  const cntLeft = mods.filter((m) => m.wall === 'left').length;
  const cntRight = mods.filter((m) => m.wall === 'right').length;

  const wallBar = h('div', {
    style: 'background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 8px; margin-bottom:8px; display:flex; flex-direction:column; gap:5px;',
  },
    h('span', { style: 'font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#475569;' }, 'Стена добавления (Г / П-кухня)'),
    h('div', { class: 'seg' },
      h('button', {
        type: 'button',
        class: `seg-b ${store.activeWall === 'back' ? 'on' : ''}`,
        onClick: () => store.setActiveWall('back'),
      }, `Задняя (${cntBack})`),
      h('button', {
        type: 'button',
        class: `seg-b ${store.activeWall === 'left' ? 'on' : ''}`,
        onClick: () => store.setActiveWall('left'),
      }, `Левая Г (${cntLeft})`),
      h('button', {
        type: 'button',
        class: `seg-b ${store.activeWall === 'right' ? 'on' : ''}`,
        onClick: () => store.setActiveWall('right'),
      }, `Правая (${cntRight})`),
    ),
  );

  const modeBar = h('div', { class: 'seg' },
    h('button', {
      type: 'button',
      class: 'seg-b' + (leftViewMode === 'split' ? ' on' : ''),
      onClick: () => { leftViewMode = 'split'; renderModules(root, store, est); },
    }, `Все (${mods.length})`),
    h('button', {
      type: 'button',
      class: 'seg-b' + (leftViewMode === 'tree' ? ' on' : ''),
      onClick: () => { leftViewMode = 'tree'; renderModules(root, store, est); },
    }, 'Дерево'),
    h('button', {
      type: 'button',
      class: 'seg-b' + (leftViewMode === 'catalog' ? ' on' : ''),
      onClick: () => { leftViewMode = 'catalog'; renderModules(root, store, est); },
    }, '+ Каталог'),
  );

  const list = h('ul', {
    class: 'mod-list',
    role: 'listbox',
    'aria-label': 'Модули проекта',
    style: leftViewMode === 'split' && mods.length > 5 ? 'max-height:36vh; overflow-y:auto; padding-right:2px;' : '',
  });
  mods.forEach((m, i) => {
    const on = m.id === store.selectedId || store.selectedIds.has(m.id);
    list.append(h('li', {
      class: 'mod' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on), tabindex: '0',
      onClick: (e: MouseEvent) => store.select(m.id, e.shiftKey),
      onKeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); store.select(m.id); } },
    },
      h('div', { class: 'mod-top' },
        h('span', { class: 'mod-idx' }, String(i + 1)),
        h('span', { class: 'mod-name' }, m.name),
        h('span', { class: 'mod-price' }, money(est.perModule[m.id] ?? 0))),
      h('div', { class: 'mod-bottom' },
        h('div', { class: 'mod-sub' }, `${m.wall === 'left' ? '[Лев] ' : m.wall === 'right' ? '[Прав] ' : ''}${KIND_LABEL[m.kind]} · ${m.w}×${m.h}×${m.d} · X:${m.x}`,
          overlaps.has(m.id) ? h('em', { class: 'warn', title: 'Модуль пересекается с соседним — измените позицию X или нажмите «В ряд»' }, 'пересечение') : null),
        h('div', { class: 'mod-act' },
          h('button', { type: 'button', class: 'ib', title: 'Выше в списке', 'aria-label': 'Выше', disabled: i === 0, onClick: (e: Event) => { e.stopPropagation(); store.move(m.id, -1); } }, icon('up', 13)),
          h('button', { type: 'button', class: 'ib', title: 'Ниже в списке', 'aria-label': 'Ниже', disabled: i === mods.length - 1, onClick: (e: Event) => { e.stopPropagation(); store.move(m.id, 1); } }, icon('down', 13)),
          h('button', { type: 'button', class: 'ib', title: 'Дублировать', 'aria-label': 'Дублировать', onClick: (e: Event) => { e.stopPropagation(); store.duplicate(m.id); } }, icon('copy', 13)),
          h('button', { type: 'button', class: 'ib danger', title: 'Удалить', 'aria-label': 'Удалить', onClick: (e: Event) => { e.stopPropagation(); store.remove(m.id); } }, icon('trash', 13))),
      )));
  });

  const head = h('div', { class: 'sec-h' },
    h('h2', null, `Сцена · ${mods.length} мод.`),
    h('button', { type: 'button', class: 'btn sm ghost', disabled: mods.length < 2, onClick: () => store.autoLayout(), title: 'Расставить нижние и верхние модули подряд, без зазоров' }, icon('rows', 13), 'В ряд'));

  const groupSections = PRESET_GROUPS.map((g) => {
    const items = g.ids.map((id) => PRESETS.find((p) => p.id === id)).filter((p): p is (typeof PRESETS)[number] => !!p);
    const det = h('details', { class: 'lib-group' },
      h('summary', null, g.label, h('small', null, String(items.length))),
      h('div', { class: 'lib-grid' },
        ...items.map((p) => h('button', { type: 'button', class: 'lib-b', onClick: () => store.addPreset(p.id) },
          h('span', { class: 'lib-ic' }, icon('plus', 12)), h('b', null, p.label), h('small', null, p.hint)))));
    if (openGroups.has(g.id)) det.setAttribute('open', '');
    det.addEventListener('toggle', () => { if ((det as HTMLDetailsElement).open) openGroups.add(g.id); else openGroups.delete(g.id); });
    return det;
  });
  const lib = h('div', { class: 'lib', style: leftViewMode === 'catalog' ? 'border-top:0; margin-top:0; padding-top:0;' : '' },
    h('h2', null, 'Каталог модулей'),
    ...groupSections,
  );

  root.append(modeBar, wallBar);
  if (leftViewMode !== 'catalog') {
    root.append(head, mods.length ? list : h('p', { class: 'empty' }, 'Сцена пуста. Выберите модуль из каталога ниже или запустите «Мастер кухни».'));
  }
  if (leftViewMode !== 'tree') {
    root.append(lib);
  }
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
      const ids = store.selectedIds.size > 1 ? store.selectedIds : new Set([m.id]);
      for (const cur of p.modules) {
        if (ids.has(cur.id)) fn(cur);
      }
    }, tag);
  };
  const multiCount = store.selectedIds.size > 1 ? store.selectedIds.size : 0;

  const corner = isCorner(m.kind);
  const wall = isWall(m.kind);
  const canSlide = m.kind === 'wardrobe';
  const matOpts = (k: MatKind) =>
    store.settings.materials.filter((x) => (k === 'facade' ? x.kind === 'facade' || x.kind === 'sheet' : x.kind === k));

  // Верхняя шапка модуля с быстрым удалением и дублированием
  const topHeader = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #e2e8f0;' },
    h('div', { style: 'display:flex; align-items:center; gap:6px; min-width:0;' },
      h('h2', { style: 'font-size:13px; font-weight:700; margin:0; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' }, multiCount > 1 ? `Выбрано модулей: ${multiCount}` : m.name),
      h('span', { class: 'chip' }, multiCount > 1 ? 'Shift + ЛКМ' : KIND_LABEL[m.kind]),
    ),
    h('div', { style: 'display:flex; gap:4px; flex-shrink:0;' },
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
      }, icon('copy', 14)),
      h('button', {
        type: 'button', class: 'ib sm danger', title: 'Удалить модуль (Del)',
        onClick: () => store.remove(m.id),
      }, icon('trash', 14)),
    ),
  );

  // Табы группировки
  const tabsBar = h('div', { class: 'seg', style: 'margin-bottom:10px; width:100%;' },
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'dims' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'dims'; renderProps(root, store); },
    }, 'Габариты'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'secs' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'secs'; renderProps(root, store); },
    }, 'Секции'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'facades' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'facades'; renderProps(root, store); },
    }, 'Фасады'),
    h('button', {
      type: 'button', class: `seg-b ${activePropTab === 'mats' ? 'on' : ''}`,
      onClick: () => { activePropTab = 'mats'; renderProps(root, store); },
    }, 'Декоры'),
  );

  const contentArea = h('div', { style: 'display:flex; flex-direction:column; gap:10px;' });

  if (activePropTab === 'dims') {
    // Вкладка 1: Размеры, позиция и стыковка
    const sameTier = (o: Module) => {
      if ((o.wall ?? 'back') !== (m.wall ?? 'back')) return false;
      if (isWall(m.kind)) {
        return isWall(o.kind) && Math.abs(o.lift - m.lift) < 300;
      }
      return !isWall(o.kind) || o.kind === 'tall';
    };
    const wallSpanLimit = (m.wall === 'left' || m.wall === 'right') ? store.project.room?.d : store.project.room?.w;
    const otherMods = store.project.modules.filter((x) => x.id !== m.id && sameTier(x));
    const leftNeighbor = otherMods
      .filter((x) => x.x + x.w <= m.x + 5)
      .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    const rightNeighbor = otherMods
      .filter((x) => x.x >= m.x + m.w - 5)
      .sort((a, b) => a.x - b.x)[0];

    const nameField = h('label', { class: 'fld wide' },
      h('span', { class: 'fld-l' }, 'Наименование узла / модуля'),
      h('input', {
        type: 'text', maxlength: '60', value: m.name, 'data-f': 'name',
        onInput: (e: Event) => set((t) => { t.name = (e.target as HTMLInputElement).value; }, 'name'),
      }),
    );

    const stdWidths = [300, 400, 450, 500, 600, 800, 900];
    const quickWidthsBar = !corner ? h('div', { class: 'fld wide' },
      h('span', { class: 'fld-l' }, 'Типовой шаг ширины (мм)'),
      h('div', { class: 'quick-widths' },
        ...stdWidths.map((sw) =>
          h('button', {
            type: 'button',
            class: `qw-btn ${m.w === sw ? 'on' : ''}`,
            onClick: () => {
              store.commit((p) => {
                resizeModuleCascading(p.modules, m.id, sw, wallSpanLimit);
              }, 'w');
            },
          }, String(sw)),
        ),
      ),
    ) : null;

    const roomW = store.project.room?.w ?? 4500;
    const cornerArm2 = m.cornerW2 ?? m.w;

    const cornerConfigCard = corner ? h('div', {
      style: 'background:#eff6ff; border:1px solid #93c5fd; border-radius:6px; padding:9px 10px; display:flex; flex-direction:column; gap:8px;',
    },
      h('div', { style: 'font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a8a;' }, 'Конфигурация углового модуля'),
      segmented('Форма угла', [
        ['l-shape', 'Г-образный 90° (гармошка)'],
        ['diagonal', 'Трапеция 45° (скошенный)'],
      ] as ['l-shape' | 'diagonal', string][], m.cornerMode ?? 'l-shape', (v) => set((t) => { t.cornerMode = v; }, 'corner-mode')),
      segmented('Расположение угла в комнате', [
        ['left', 'Левый угол (Задняя + Левая)'],
        ['right', 'Правый угол (Задняя + Правая)'],
      ] as ['left' | 'right', string][], m.mirror ? 'right' : 'left', (side) => {
        store.commit((p) => {
          const cur = p.modules.find((x) => x.id === m.id);
          if (!cur) return;
          const rw = p.room?.w ?? 4500;
          const isRight = side === 'right';
          cur.mirror = isRight;
          delete cur.wall;
          cur.x = isRight ? Math.max(0, rw - cur.w) : 0;
          const armZ = cur.cornerW2 ?? cur.w;
          for (const o of p.modules) {
            if (o.id === cur.id || !verticalOverlap(o, cur)) continue;
            const ow = o.wall ?? 'back';
            if (!isRight && ow === 'left' && o.x < armZ) o.x = armZ;
            if (isRight && ow === 'right' && o.x < armZ) o.x = armZ;
          }
        }, 'corner-side');
      }),
      h('div', { class: 'fld wide' },
        h('span', { class: 'fld-l' }, 'Типовой габарит угла (мм)'),
        h('div', { class: 'quick-widths' },
          ...(wall ? [[600, 600], [650, 650], [700, 600]] : [[850, 850], [900, 900], [1000, 900], [1050, 900]]).map(([s1, s2]) =>
            h('button', {
              type: 'button',
              class: `qw-btn ${m.w === s1 && cornerArm2 === s2 ? 'on' : ''}`,
              onClick: () => {
                store.commit((p) => {
                  const cur = p.modules.find((x) => x.id === m.id);
                  if (!cur) return;
                  resizeModuleCascading(p.modules, m.id, s1, p.room?.w);
                  cur.cornerW2 = s2;
                  if (cur.mirror) cur.x = Math.max(0, (p.room?.w ?? 4500) - cur.w);
                }, 'corner-size');
              },
            }, `${s1}×${s2}`),
          ),
        ),
      ),
      m.kind === 'corner'
        ? toggle('Врезная мойка в угловом модуле', 'cornerSink', m.cornerSink === true, (v) => set((t) => { t.cornerSink = v; }, 'cornerSink'))
        : null,
    ) : null;

    const dimsGrid = h('div', { class: 'grid2' },
      numField(corner ? 'Крыло осн. (W)' : 'Ширина (W)', 'w', m.w, LIMITS.w, (v) => {
        store.commit((p) => {
          resizeModuleCascading(p.modules, m.id, v, wallSpanLimit);
        }, 'w');
      }),
      corner ? numField('Крыло бок. (W2)', 'cornerW2', cornerArm2, LIMITS.w, (v) => set((t) => { t.cornerW2 = v; }, 'cornerW2')) : null,
      numField('Высота (H)', 'h', m.h, LIMITS.h, (v) => {
        store.commit((p) => {
          const ids = store.selectedIds.size > 1 ? Array.from(store.selectedIds) : [m.id];
          ids.forEach((id) => resizeHeightWithStack(p.modules, id, v));
        }, 'h');
      }),
      numField(corner ? 'Глубина плеча' : 'Глубина (D)', 'd', m.d, LIMITS.d, (v) => set((t) => { t.d = v; }, 'd')),
      wall ? numField('Отметка от пола (Y)', 'lift', m.lift, LIMITS.lift, (v) => set((t) => { t.lift = v; }, 'lift'))
        : numField('Высота цоколя', 'plinth', m.plinth, LIMITS.plinth, (v) => set((t) => { t.plinth = v; }, 'plinth')),
      numField('Координата X', 'x', m.x, LIMITS.x, (v) => {
        store.commit((p) => {
          shiftModuleCascading(p.modules, m.id, v, wallSpanLimit, roomW);
        }, 'x');
      }),
      m.kind !== 'base' && m.kind !== 'corner'
        ? numField('Добор карниза', 'topTrim', m.topTrim ?? 0, LIMITS.topTrim, (v) => set((t) => {
          if (v > 0) t.topTrim = v;
          else delete t.topTrim;
        }, 'topTrim'))
        : null,
    );

    const activeTrimH = getActiveTopTrimH(store.project.modules);
    const topTrimCard = h('div', {
      style: 'background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin-top:4px;',
    },
      h('div', { style: 'font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#334155; margin-bottom:5px;' }, 'Карниз верхнего яруса (под потолок)'),
      h('div', { class: 'quick-widths' },
        ...[0, 50, 60, 80, 100].map((th) =>
          h('button', {
            type: 'button',
            class: `qw-btn ${activeTrimH === th ? 'on' : ''}`,
            onClick: () => {
              store.commit((p) => {
                applyTopTrimToUpperRow(p.modules, th);
              }, 'top-trim-row');
            },
          }, th === 0 ? 'Нет' : `${th}`),
        ),
      ),
    );

    const snapActions = h('div', { class: 'grp', style: 'padding-top:8px;' },
      h('span', { class: 'fld-l' }, 'Стыковка модулей в ряду'),
      h('div', { class: 'btn-bar', style: 'margin-top:4px;' },
        h('button', {
          class: 'btn btn-ghost sm',
          disabled: !leftNeighbor,
          title: leftNeighbor ? `Пристыковать вплотную к "${leftNeighbor.name}" слева` : 'Нет соседа слева',
          onClick: () => {
            if (leftNeighbor) {
              store.commit((p) => {
                shiftModuleCascading(p.modules, m.id, leftNeighbor.x + leftNeighbor.w, wallSpanLimit, roomW);
              }, 'snap');
            }
          },
        }, '← Вплотную влево'),
        h('button', {
          class: 'btn btn-ghost sm',
          disabled: !rightNeighbor,
          title: rightNeighbor ? `Пристыковать вплотную к "${rightNeighbor.name}" справа` : 'Нет соседа справа',
          onClick: () => {
            if (rightNeighbor) {
              store.commit((p) => {
                shiftModuleCascading(p.modules, m.id, rightNeighbor.x - m.w, wallSpanLimit, roomW);
              }, 'snap');
            }
          },
        }, 'Вплотную вправо →'),
      ),
    );

    const effWallSpan = wallSpanLimit ?? roomW;
    const isNearLeftWall = m.x <= 25;
    const isNearRightWall = m.x + m.w >= effWallSpan - 25;

    const blindCornerQuickCard = !corner && m.kind !== 'wardrobe' && (m.blindSide || isNearLeftWall || isNearRightWall)
      ? h('div', {
          style: 'background:#eff6ff; border:1px solid #93c5fd; border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:7px;',
        },
          segmented('Прямой угловой стык (глухая зона + L-бленда 90°)', [
            ['none', 'Нет'],
            ['left', 'Угол слева'],
            ['right', 'Угол справа'],
          ] as ['none' | 'left' | 'right', string][], m.blindSide ?? 'none', (v) => {
            store.commit((p) => {
              const cur = p.modules.find((x) => x.id === m.id);
              if (!cur) return;
              if (v === 'none') {
                delete cur.blindSide;
                delete cur.blindW;
                delete cur.blindFillerW;
              } else {
                cur.blindSide = v;
                cur.blindFillerW = cur.blindFillerW ?? (wall ? 40 : 45);
                autoFitBlindZone(p.modules, cur.id, p.room?.w ?? 4500);
              }
            }, 'blind-toggle');
          }),
          m.blindSide ? h('div', { class: 'grid2' },
            numField('Глухая зона (мм)', 'blindW-d', m.blindW ?? (wall ? 340 : 605), [25, Math.max(150, m.w - 120)], (v) => set((t) => { t.blindW = v; }, 'blindW')),
            numField('L-бленда 90° (мм)', 'blindFillerW-d', m.blindFillerW ?? (wall ? 40 : 45), [16, 100], (v) => set((t) => { t.blindFillerW = v; }, 'blindFillerW')),
          ) : null,
          m.blindSide ? h('button', {
            type: 'button',
            class: 'btn btn-ghost sm',
            onClick: () => {
              store.commit((p) => {
                autoFitBlindZone(p.modules, m.id, p.room?.w ?? 4500);
              }, 'blind-autofit');
            },
          }, 'Подогнать под глубину соседней стены') : null,
        )
      : null;

    const makeFiller = (xPos: number): Module => ({
      id: uid(),
      kind: m.kind === 'wall' ? 'wall' : m.kind === 'tall' ? 'tall' : 'base',
      name: 'Фальшпланка к стене',
      x: xPos,
      w: 50,
      h: m.h,
      d: m.d,
      t: m.t,
      plinth: m.plinth,
      lift: m.lift,
      mirror: false,
      slidingCount: 2,
      drawerH: 160,
      countertop: m.countertop,
      matCorpus: m.matCorpus,
      matFacade: m.matFacade,
      matBack: m.matBack,
      matTop: m.matTop,
      ...(m.plinthColor ? { plinthColor: m.plinthColor } : {}),
      ...(m.topTrim ? { topTrim: m.topTrim } : {}),
      doorMode: 'none',
      handles: false,
      sections: [{ shelves: 0, drawers: 0, rods: 0, rod: false, door: false }],
    });

    let wallAlert: HTMLElement | null = null;
    if (isNearLeftWall || isNearRightWall) {
      wallAlert = h('div', {
        class: 'wall-alert',
        style: 'background:#fffbeb; border:1px solid #f59e0b; border-radius:6px; padding:8px 10px; font-size:11.5px; color:#92400e; margin-top:4px;',
      },
        h('div', { style: 'font-weight:700; font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;' }, 'Примыкание к стене · Зазор открывания'),
        h('div', { style: 'font-size:11px; opacity:0.95; line-height:1.35; margin-bottom:6px;' }, 'Для свободного открывания фасада на 90° без удара ручки о стену рекомендуется фальшпланка 50 мм.'),
        h('div', { style: 'display:flex; gap:5px; flex-wrap:wrap;' },
          isNearLeftWall ? h('button', {
            type: 'button',
            class: 'btn primary sm',
            onClick: () => {
              store.commit((p) => {
                insertFillerWithShift(p.modules, 'left', m, makeFiller(0), wallSpanLimit, roomW);
              }, 'add-filler');
            },
          }, '+ Добор слева 50 мм') : null,
          isNearRightWall ? h('button', {
            type: 'button',
            class: 'btn primary sm',
            onClick: () => {
              store.commit((p) => {
                insertFillerWithShift(p.modules, 'right', m, makeFiller(0), wallSpanLimit, roomW);
              }, 'add-filler');
            },
          }, '+ Добор справа 50 мм') : null,
        ),
      );
    }

    const fillerActions = h('div', { class: 'grp', style: 'padding-top:8px;' },
      h('span', { class: 'fld-l' }, 'Пристенные доборы (фальшпланки 50 мм)'),
      h('div', { class: 'btn-bar', style: 'margin-top:4px;' },
        h('button', {
          type: 'button',
          class: 'btn btn-ghost sm',
          title: 'Вставить фальшпланку 50 мм слева от модуля',
          onClick: () => {
            store.commit((p) => {
              insertFillerWithShift(p.modules, 'left', m, makeFiller(0), wallSpanLimit, roomW);
            }, 'add-filler');
          },
        }, '+ Добор слева'),
        h('button', {
          type: 'button',
          class: 'btn btn-ghost sm',
          title: 'Вставить фальшпланку 50 мм справа от модуля',
          onClick: () => {
            store.commit((p) => {
              insertFillerWithShift(p.modules, 'right', m, makeFiller(0), wallSpanLimit, roomW);
            }, 'add-filler');
          },
        }, '+ Добор справа'),
      ),
    );

    const advanced = h('details', { class: 'more' },
      h('summary', null, 'Параметры плиты, стены и стыковки'),
      h('div', { style: 'display:flex; flex-direction:column; gap:8px; padding-top:8px;' },
        segmented('Стена размещения (Г / П-кухня)', [
          ['back', 'Задняя'],
          ['left', 'Левая'],
          ['right', 'Правая'],
        ] as ['back' | 'left' | 'right', string][], m.wall ?? 'back', (v) => set((t) => {
          if (v === 'back') delete t.wall;
          else t.wall = v;
        }, 'wall')),
        segmented('Толщина ЛДСП', [[16, '16 мм'], [18, '18 мм']] as [number, string][], m.t, (v) => set((t) => { t.t = v === 18 ? 18 : 16; })),
        toggle('Зеркальное исполнение (реверс)', 'mirror', m.mirror, (v) => set((t) => { t.mirror = v; })),
        snapActions,
        fillerActions,
      ),
    );
    if (m.t !== 16 || m.mirror || (m.wall && m.wall !== 'back')) advanced.setAttribute('open', '');

    const sameTierHeightMods = store.project.modules.filter((o) => o.id !== m.id && isSameVerticalTier(o, m));
    const syncTierBtn = sameTierHeightMods.length > 0 ? h('div', { class: 'btn-bar', style: 'margin-top:2px;' },
      h('button', {
        type: 'button',
        class: 'btn btn-ghost sm',
        style: 'flex:1;',
        title: 'Применить высоту текущего модуля ко всем шкафам этого яруса (например, ко всем антресолям или верхним шкафам)',
        onClick: () => {
          store.commit((p) => {
            syncTierHeight(p.modules, m.id);
          }, 'sync-tier-h');
        },
      }, `Высота яруса (${m.h} мм)`),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost sm',
        style: 'flex:1;',
        title: 'Сделать одинаковую глубину у всех шкафов этого яруса (например, у всех антресолей 300 мм вровень с верхними)',
        onClick: () => {
          store.commit((p) => {
            syncTierDepth(p.modules, m.id);
          }, 'sync-tier-d');
        },
      }, `Глубина яруса (${m.d} мм)`),
    ) : null;

    contentArea.append(nameField);
    if (cornerConfigCard) contentArea.append(cornerConfigCard);
    if (quickWidthsBar) contentArea.append(quickWidthsBar);
    contentArea.append(dimsGrid);
    if (blindCornerQuickCard) contentArea.append(blindCornerQuickCard);
    if (syncTierBtn) contentArea.append(syncTierBtn);
    contentArea.append(topTrimCard);
    if (wallAlert) contentArea.append(wallAlert);
    contentArea.append(advanced);

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

    const zones = getTallOvenZones(m);
    const applianceZonesCard = zones.isTallOven ? h('div', {
      style: 'background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:6px;',
    },
      h('span', { class: 'fld-l', style: 'color:#0f172a; font-weight:700;' }, 'Высоты зон техники (снизу вверх)'),
      h('div', { class: 'grid2' },
        numField('Нижний отсек / ящик', 'drh', m.drawerH || 360, LIMITS.drawerH, (v) => set((t) => { t.drawerH = v; }, 'drh')),
        numField('Ниша духовки', 'ovenH', m.ovenH ?? 600, [350, 750], (v) => set((t) => { t.ovenH = v; }, 'ovenH')),
        numField('Ниша СВЧ (0 = нет)', 'mwH', m.mwH ?? (/свч/i.test(m.name) ? 380 : 0), [0, 550], (v) => set((t) => { t.mwH = v; }, 'mwH')),
      ),
      h('div', { style: 'font-size:11px; color:#475569; font-weight:600;' },
        `Верхний шкаф (остаток с полками): ${Math.max(0, Math.round((m.h - (m.t || 16)) - zones.upperZoneBottom))} мм`,
      ),
    ) : null;

    contentArea.append(presetsWrap);
    if (applianceZonesCard) contentArea.append(applianceZonesCard);
    contentArea.append(sectionsList);

  } else if (activePropTab === 'facades') {
    // Вкладка 3: Фасады и ручки
    const doorOpts: [DoorMode, string][] = [['none', 'Открытый'], ['hinged', 'Распашные']];
    if (canSlide) doorOpts.push(['sliding', 'Купе']);

    const facadeNodes: HTMLElement[] = [
      segmented('Тип дверей', doorOpts, m.doorMode, (v) => set((t) => { t.doorMode = v; })),
    ];
    if (m.doorMode === 'hinged') {
      facadeNodes.push(
        segmented('Створок на секцию', [
          ['auto', 'Авто'],
          [1, '1 дверь'],
          [2, '2 двери'],
        ] as ['auto' | 1 | 2, string][], m.doorCount ?? 'auto', (v) => {
          set((t) => {
            if (v === 'auto') delete t.doorCount;
            else t.doorCount = v;
          });
        }),
      );
      if (m.sections.length === 1) {
        const curHinge = m.hinge ?? 'left';
        facadeNodes.push(
          segmented('Открывание фасада (петли / газлифт)', [
            ['left', 'Влево'],
            ['right', 'Вправо'],
            ['top', 'Вверх (газлифт)'],
          ], curHinge, (v) => set((t) => { t.hinge = v as 'left' | 'right' | 'top'; })),
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
      facadeNodes.push(segmented('Цоколь снизу (цельный в ряду)', [
        ['facade', 'В тон фасадов'],
        ['corpus', 'В тон корпуса'],
        ['black', 'Чёрный'],
      ], m.plinthColor ?? 'facade', (v) => set((t) => { t.plinthColor = v; })));
    }
    const curGlobalTrim = getActiveTopTrimH(store.project.modules);
    facadeNodes.push(
      segmented('Верхняя планка (карниз под потолок)', [
        [0, 'Нет'],
        [50, '50 мм'],
        [60, '60 мм'],
        [80, '80 мм'],
        [100, '100 мм'],
      ] as [number, string][], curGlobalTrim, (v) => {
        store.commit((p) => {
          applyTopTrimToUpperRow(p.modules, v);
        }, 'top-trim-row');
      }),
    );
    facadeNodes.push(toggle('Лицевые ручки', 'handles', m.handles, (v) => set((t) => { t.handles = v; })));
    if (m.handles) {
      facadeNodes.push(
        h('div', { style: 'background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:7px;' },
          segmented('Расположение ручки на двери', [
            ['side', 'Сбоку (вертик.)'],
            ['top-horiz', 'Сверху (под ящики)'],
            ['edge-top', 'Торцевая сверху'],
          ] as ['side' | 'top-horiz' | 'edge-top', string][], m.handlePos ?? 'side', (v) => set((t) => {
            if (v === 'side') delete t.handlePos;
            else t.handlePos = v;
          }, 'handle-pos')),
          segmented('Цвет ручек и профиля', [
            ['silver', 'Хром / Сатин'],
            ['black', 'Чёрный мат'],
            ['gold', 'Золото браш'],
          ] as ['silver' | 'black' | 'gold', string][], m.handleColor ?? 'silver', (v) => set((t) => {
            if (v === 'silver') delete t.handleColor;
            else t.handleColor = v;
          }, 'handle-color')),
          h('button', {
            type: 'button',
            class: 'btn btn-ghost sm',
            onClick: () => {
              store.commit((p) => {
                for (const mod of p.modules) {
                  if (!isWall(mod.kind) && mod.kind !== 'tall') {
                    mod.handles = true;
                    if (m.handlePos) mod.handlePos = m.handlePos;
                    else delete mod.handlePos;
                  }
                  if (m.handleColor) mod.handleColor = m.handleColor;
                  else delete mod.handleColor;
                }
              }, 'sync-handles');
            },
          }, 'Применить стиль ручек ко всему нижнему ряду'),
        ),
      );
    }
    if (m.kind === 'base' || m.kind === 'corner') {
      facadeNodes.push(toggle('Столешница 38 мм', 'top', m.countertop, (v) => set((t) => { t.countertop = v; })));
    }
    if (!corner && m.kind !== 'wardrobe') {
      const curBlind = m.blindSide ?? 'none';
      const defaultBlindW = wall ? 350 : 550;
      facadeNodes.push(
        h('div', { style: 'background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:7px;' },
          segmented('Угловой стык (глухая зона + L-планка)', [
            ['none', 'Нет'],
            ['left', 'Утоплен слева'],
            ['right', 'Утоплен справа'],
          ] as ['none' | 'left' | 'right', string][], curBlind, (v) => {
            set((t) => {
              if (v === 'none') {
                delete t.blindSide;
                delete t.blindW;
                delete t.blindFillerW;
              } else {
                t.blindSide = v;
                t.blindW = t.blindW ?? defaultBlindW;
                t.blindFillerW = t.blindFillerW ?? 50;
              }
            });
          }),
          curBlind !== 'none' ? h('div', { class: 'grid2' },
            numField('Глухая зона (мм)', 'blindW', m.blindW ?? defaultBlindW, [25, Math.max(150, m.w - 120)], (v) => set((t) => { t.blindW = v; }, 'blindW')),
            numField('L-планка угла (мм)', 'blindFillerW', m.blindFillerW ?? 50, [16, 100], (v) => set((t) => { t.blindFillerW = v; }, 'blindFillerW')),
          ) : null,
        ),
      );
    }
    contentArea.append(...facadeNodes);

  } else if (activePropTab === 'mats') {
    // Вкладка 4: Цвета и декоры
    const matNodes: HTMLElement[] = [
      selectField('ЛДСП Корпуса', 'mc', matOpts('sheet'), m.matCorpus, (v) => set((t) => { t.matCorpus = v; })),
      selectField('МДФ / ЛДСП Фасадов', 'mf', matOpts('facade'), m.matFacade, (v) => set((t) => { t.matFacade = v; })),
      selectField('ХДФ Задней стенки', 'mb', matOpts('back'), m.matBack, (v) => set((t) => { t.matBack = v; })),
    ];
    if (m.countertop) {
      matNodes.push(selectField('Столешница 38 мм', 'mt', matOpts('top'), m.matTop, (v) => set((t) => { t.matTop = v; })));
    }
    if (store.project.modules.length > 1) {
      matNodes.push(
        h('button', {
          type: 'button',
          class: 'btn btn-ghost sm',
          style: 'width:100%; margin-top:4px;',
          title: 'Скопировать декоры корпуса, фасадов, ХДФ и столешницы этого модуля на все остальные модули проекта',
          onClick: () => {
            store.commit((p) => {
              p.modules.forEach((mod) => {
                mod.matCorpus = m.matCorpus;
                mod.matFacade = m.matFacade;
                mod.matBack = m.matBack;
                mod.matTop = m.matTop;
                if (m.plinthColor) mod.plinthColor = m.plinthColor;
              });
            }, 'sync-mats');
          },
        }, 'Применить декоры ко всему проекту'),
      );
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
