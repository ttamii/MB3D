import type { Store } from '../app/store';
import type { Viewer } from '../three/viewer';
import { h, icon } from './dom';
import { blueprintDialog } from './dialogs';
import { resizeModuleCascading, shiftModuleCascading } from '../core/collision';
import { uid } from '../core/util';

let activeMenu: HTMLElement | null = null;

export function showModuleContextMenu(
  moduleId: string,
  x: number,
  y: number,
  store: Store,
  viewer: Viewer,
): void {
  hideContextMenu();

  const m = store.project.modules.find((item) => item.id === moduleId);
  if (!m) return;

  const menu = h('div', { class: 'ctx-menu' });
  menu.style.left = `${Math.min(window.innerWidth - 260, Math.max(10, x))}px`;
  menu.style.top = `${Math.min(window.innerHeight - 440, Math.max(10, y))}px`;

  const head = h('div', { class: 'ctx-head' }, `${m.name} · ${m.w}×${m.h}×${m.d} мм`);

  const item = (label: string, ic: string, onClick: () => void, kbd?: string, danger?: boolean) => {
    const el = h('button', {
      type: 'button',
      class: `ctx-item${danger ? ' danger' : ''}`,
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        hideContextMenu();
        onClick();
      },
    },
      icon(ic, 16),
      h('span', null, label),
      kbd ? h('kbd', null, kbd) : null,
    );
    return el;
  };

  const pill = (label: string, active: boolean, onClick: () => void) => {
    return h('button', {
      type: 'button',
      class: `ctx-pill${active ? ' active' : ''}`,
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        onClick();
        hideContextMenu();
      },
    }, label);
  };

  const isOpen = viewer.isOpen();
  const currentShelves = m.sections.reduce((sum, s) => sum + s.shelves, 0);

  // Быстрый выбор ширины модуля
  const widthRow = h('div', { class: 'ctx-row' },
    h('span', { class: 'ctx-row-label' }, 'Ширина:'),
    h('div', { class: 'ctx-pills' },
      ...[400, 450, 600, 800].map((w) =>
        pill(`${w}`, m.w === w, () => {
          store.commit((p) => {
            const span = (m.wall === 'left' || m.wall === 'right') ? p.room?.d : p.room?.w;
            resizeModuleCascading(p.modules, moduleId, w, span);
          }, 'resize-w');
        })
      ),
    ),
  );

  // Управление полками (- / +)
  const shelvesRow = h('div', { class: 'ctx-row' },
    h('span', { class: 'ctx-row-label' }, `Полок: ${currentShelves}`),
    h('div', { class: 'ctx-pills' },
      pill('- 1', currentShelves === 0, () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target && target.sections[0] && target.sections[0].shelves > 0) {
            target.sections[0].shelves -= 1;
          }
        }, 'shelves-dec');
      }),
      pill('+ 1', false, () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target && target.sections[0] && target.sections[0].shelves < 8) {
            target.sections[0].shelves += 1;
          }
        }, 'shelves-inc');
      }),
    ),
  );

  // Фрезеровка фасадов
  const curMilling = m.milling ?? 'modern';
  const millingRow = h('div', { class: 'ctx-row' },
    h('span', { class: 'ctx-row-label' }, 'Фасад:'),
    h('div', { class: 'ctx-pills' },
      pill('Гладкий', curMilling === 'modern', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) target.milling = 'modern';
        }, 'milling-modern');
      }),
      pill('Рамка', curMilling === 'frame', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) target.milling = 'frame';
        }, 'milling-frame');
      }),
      pill('Рельеф', curMilling === 'ribbed', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) target.milling = 'ribbed';
        }, 'milling-ribbed');
      }),
    ),
  );

  // Ручки / Push-to-open (с быстрым переключением ручки сверху у мойки и тумб!)
  const curHandlePos = m.handlePos ?? 'side';
  const handlesRow = h('div', { class: 'ctx-row' },
    h('span', { class: 'ctx-row-label' }, 'Ручки:'),
    h('div', { class: 'ctx-pills' },
      pill('Сбоку', m.handles && curHandlePos === 'side', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) { target.handles = true; delete target.handlePos; }
        }, 'handles-side');
      }),
      pill('Сверху (горизонт.)', m.handles && curHandlePos === 'top-horiz', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) {
            target.handles = true;
            target.handlePos = 'top-horiz';
            if (target.kind === 'tall' && /духов|свч/i.test(target.name)) {
              target.upperHandles = false;
            }
          }
        }, 'handles-top');
      }),
      pill('Торцевая', m.handles && curHandlePos === 'edge-top', () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) { target.handles = true; target.handlePos = 'edge-top'; }
        }, 'handles-edge');
      }),
      pill('Push-to-open', !m.handles, () => {
        store.commit((p) => {
          const target = p.modules.find((item) => item.id === moduleId);
          if (target) target.handles = false;
        }, 'handles-off');
      }),
    ),
  );

  menu.append(
    head,
    widthRow,
    shelvesRow,
    millingRow,
    handlesRow,
    h('div', { class: 'ctx-sep' }),
    item(isOpen ? 'Закрыть дверцы' : 'Открыть дверцы', 'door', () => {
      viewer.setOpen(!isOpen);
    }),
    ...(m.doorMode === 'hinged' ? [
      m.sections.length === 1
        ? item(
            (m.hinge ?? 'left') === 'right' ? 'Петли слева (ручка справа)' : 'Петли справа (ручка слева)',
            'sliders',
            () => {
              store.commit((p) => {
                const target = p.modules.find((item) => item.id === moduleId);
                if (target) {
                  const cur = target.hinge ?? 'left';
                  target.hinge = cur === 'right' ? 'left' : 'right';
                }
              }, 'toggle-hinge');
            },
          )
        : item(
            m.mirror ? 'Сбросить зеркальность дверей' : 'Отзеркалить открывание дверей',
            'sliders',
            () => {
              store.commit((p) => {
                const target = p.modules.find((item) => item.id === moduleId);
                if (target) target.mirror = !target.mirror;
              }, 'toggle-mirror');
            },
          ),
    ] : []),
    ...(m.kind === 'tall' && /духов|свч/i.test(m.name) ? [
      item(
        m.upperHandles === true
          ? 'Убрать ручку над СВЧ (Push-to-Open)'
          : 'Поставить ручку на шкаф над СВЧ',
        'sliders',
        () => {
          store.commit((p) => {
            const target = p.modules.find((it) => it.id === moduleId);
            if (target) target.upperHandles = !(target.upperHandles === true);
          }, 'toggle-upper-handle');
        },
      ),
    ] : []),
    ...(m.kind === 'base' && m.w >= 450 ? [
      item(
        (m.cooktop === true || (m.cooktop !== false && /духов|варочн|плит|индукц/i.test(m.name)))
          ? 'Убрать варочную панель со столешницы'
          : 'Поставить варочную панель на столешницу',
        'grid',
        () => {
          store.commit((p) => {
            const target = p.modules.find((it) => it.id === moduleId);
            if (target) {
              const cur = target.cooktop === true || (target.cooktop !== false && /духов|варочн|плит|индукц/i.test(target.name));
              target.cooktop = !cur;
              target.countertop = true;
            }
          }, 'toggle-cooktop');
        },
      ),
    ] : []),
    item('Сделать модулем мойки', 'check', () => {
      store.commit((p) => {
        const target = p.modules.find((item) => item.id === moduleId);
        if (target) {
          target.sections = [{ shelves: 0, drawers: 0, rods: 0, rod: false, door: true }];
          target.doorMode = 'hinged';
        }
      }, 'preset-sink');
    }),
    item('3 выдвижных ящика', 'rows', () => {
      store.commit((p) => {
        const target = p.modules.find((item) => item.id === moduleId);
        if (target) {
          target.sections = [{ shelves: 0, drawers: 3, rods: 0, rod: false, door: false }];
          target.doorMode = 'none';
          target.drawerH = Math.round((target.h - (target.plinth ?? 100)) / 3);
        }
      }, 'preset-drawers');
    }),
    item('Ниша под духовой шкаф', 'cube', () => {
      store.commit((p) => {
        const target = p.modules.find((item) => item.id === moduleId);
        if (target) {
          target.sections = [{ shelves: 1, drawers: 1, rods: 0, rod: false, door: false }];
          target.doorMode = 'none';
          target.drawerH = 160;
        }
      }, 'preset-oven');
    }),
    h('div', { class: 'ctx-sep' }),
    item('Пристыковать слева встык', 'up', () => {
      const mWall = m.wall ?? 'back';
      const otherMods = store.project.modules.filter((item) => item.id !== m.id && (item.wall ?? 'back') === mWall);
      const leftNeighbor = otherMods
        .filter((item) => item.x + item.w <= m.x + 5)
        .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
      if (leftNeighbor) {
        store.commit((p) => {
          const span = (mWall === 'left' || mWall === 'right') ? p.room?.d : p.room?.w;
          shiftModuleCascading(p.modules, moduleId, leftNeighbor.x + leftNeighbor.w, span, p.room?.w ?? 4500);
        }, 'snap-left');
      }
    }),
    item('Пристыковать справа встык', 'down', () => {
      const mWall = m.wall ?? 'back';
      const otherMods = store.project.modules.filter((item) => item.id !== m.id && (item.wall ?? 'back') === mWall);
      const rightNeighbor = otherMods
        .filter((item) => item.x >= m.x + m.w - 5)
        .sort((a, b) => a.x - b.x)[0];
      if (rightNeighbor) {
        store.commit((p) => {
          const span = (mWall === 'left' || mWall === 'right') ? p.room?.d : p.room?.w;
          shiftModuleCascading(p.modules, moduleId, rightNeighbor.x - m.w, span, p.room?.w ?? 4500);
        }, 'snap-right');
      }
    }),
    item('Дублировать шкаф', 'copy', () => {
      const copy = JSON.parse(JSON.stringify(m));
      copy.id = uid();
      copy.name = `${m.name} (копия)`;
      copy.x = m.x + m.w;
      store.commit((p) => { p.modules.push(copy); }, 'dup');
      store.select(copy.id);
    }, 'Ctrl+D'),
    item('Чертёж и схема присадки', 'blueprint', () => {
      blueprintDialog(store, viewer);
    }),
    h('div', { class: 'ctx-sep' }),
    item('Удалить шкаф', 'trash', () => {
      store.remove(moduleId);
    }, 'Del', true),
  );

  document.body.appendChild(menu);
  activeMenu = menu;

  const onDocClick = (e: MouseEvent) => {
    if (activeMenu && !activeMenu.contains(e.target as Node)) {
      hideContextMenu();
      document.removeEventListener('pointerdown', onDocClick);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', onDocClick), 10);
}

export function hideContextMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  const leftover = document.querySelector('.ctx-menu');
  if (leftover) leftover.remove();
}
