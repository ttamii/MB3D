import type { Store } from '../app/store';
import { applyTopTrimToUpperRow, getActiveTopTrimH, isSameVerticalTier, resizeHeightWithStack, resizeModuleCascading, syncTierHeight } from '../core/collision';
import { isWall } from '../core/defaults';
import type { Viewer } from '../three/viewer';
import { clear, h, icon } from './dom';

export interface FloatingHud {
  update: () => void;
  destroy: () => void;
}

/**
 * Плавающий виджет «Быстрые размеры» (в стиле Qdesign/Базис),
 * отображаемый прямо в верхней части 3D-сцены над выбранным модулем.
 */
export function createFloatingHud(container: HTMLElement, store: Store, _viewer: Viewer): FloatingHud {
  const root = h('div', { class: 'hud-float', style: 'display:none;' });
  container.appendChild(root);

  let isCollapsed = false;
  let customPos: { x: number; y: number } | null = null;
  let dragStart: { mouseX: number; mouseY: number; elemX: number; elemY: number } | null = null;
  let didDrag = false;

  const applyPosition = () => {
    if (customPos) {
      root.style.left = `${customPos.x}px`;
      root.style.top = `${customPos.y}px`;
      root.style.transform = 'none';
    } else {
      root.style.left = '50%';
      root.style.top = '58px';
      root.style.transform = 'translateX(-50%)';
    }
  };

  const render = () => {
    clear(root);

    const m = store.selectedId ? store.project.modules.find((x) => x.id === store.selectedId) : null;
    if (!m) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'flex';
    applyPosition();
    const modIndex = store.project.modules.findIndex((x) => x.id === m.id);

    // 1. Верхний бейдж с крупными размерами и ручкой перетаскивания
    const collapseBtn = h('button', {
      type: 'button',
      class: 'hud-collapse-btn',
      title: isCollapsed ? 'Развернуть параметры' : 'Свернуть параметры',
      onClick: (e: Event) => {
        e.stopPropagation();
        isCollapsed = !isCollapsed;
        render();
      },
    }, isCollapsed ? '▼' : '▲');

    const badge = h('div', {
      class: 'hud-badge',
      title: 'Потяните для перемещения виджета, клик — свернуть/развернуть',
    },
      h('div', { class: 'hud-badge-tag' }, String(modIndex + 1)),
      h('div', { class: 'hud-badge-info' },
        h('span', { class: 'hud-badge-name' }, m.name),
        h('b', { class: 'hud-badge-dims' }, `${m.w} × ${m.h} × ${m.d} мм`),
      ),
      collapseBtn,
    );

    badge.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.hud-collapse-btn')) return;
      badge.setPointerCapture(e.pointerId);
      const rect = root.getBoundingClientRect();
      const parentRect = container.getBoundingClientRect();
      dragStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        elemX: rect.left - parentRect.left,
        elemY: rect.top - parentRect.top,
      };
      didDrag = false;
    });

    badge.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.mouseX;
      const dy = e.clientY - dragStart.mouseY;
      if (!didDrag && Math.hypot(dx, dy) > 4) {
        didDrag = true;
      }
      if (didDrag) {
        const parentRect = container.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const newX = Math.max(8, Math.min(parentRect.width - rootRect.width - 8, dragStart.elemX + dx));
        const newY = Math.max(8, Math.min(parentRect.height - rootRect.height - 8, dragStart.elemY + dy));
        customPos = { x: newX, y: newY };
        applyPosition();
      }
    });

    const finishDrag = (e: PointerEvent) => {
      if (!dragStart) return;
      try { badge.releasePointerCapture(e.pointerId); } catch {}
      if (!didDrag) {
        isCollapsed = !isCollapsed;
        render();
      }
      dragStart = null;
      didDrag = false;
    };

    badge.addEventListener('pointerup', finishDrag);
    badge.addEventListener('pointercancel', finishDrag);

    root.append(badge);

    if (isCollapsed) return;

    // 2. Карточка с микро-степперами
    const card = h('div', { class: 'hud-card' });

    // Вспомогательный степпер
    const stepper = (
      label: string,
      axis: string,
      val: number,
      min: number,
      max: number,
      step: number,
      onChange: (v: number) => void,
    ) => {
      const input = h('input', {
        type: 'number',
        class: 'hud-step-inp',
        value: String(val),
        min: String(min),
        max: String(max),
        step: String(step),
        onInput: (e: Event) => {
          const n = (e.target as HTMLInputElement).valueAsNumber;
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        },
        onChange: (e: Event) => {
          const n = (e.target as HTMLInputElement).valueAsNumber;
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else (e.target as HTMLInputElement).value = String(val);
        },
      });

      const decBtn = h('button', {
        type: 'button',
        class: 'hud-step-arr',
        title: `Уменьшить на ${step} мм`,
        onClick: () => {
          const next = Math.max(min, val - step);
          onChange(next);
        },
      }, '◀');

      const incBtn = h('button', {
        type: 'button',
        class: 'hud-step-arr',
        title: `Увеличить на ${step} мм`,
        onClick: () => {
          const next = Math.min(max, val + step);
          onChange(next);
        },
      }, '▶');

      return h('div', { class: 'hud-row' },
        h('span', { class: 'hud-row-label' }, label),
        h('div', { class: 'hud-step-box' },
          decBtn,
          h('span', { class: 'hud-axis' }, axis),
          input,
          h('span', { class: 'hud-unit' }, 'мм'),
          incBtn,
        ),
      );
    };

    // Строки: Ширина, Высота, Глубина, От пола
    card.append(
      stepper('Ширина', 'X', m.w, 50, 4000, 50, (v) => {
        store.commit((p) => {
          resizeModuleCascading(p.modules, m.id, v, p.room?.w);
        }, 'hud-width');
      }),
      stepper('Высота', 'Y', m.h, 150, 2800, 20, (v) => {
        store.commit((p) => {
          resizeHeightWithStack(p.modules, m.id, v);
        }, 'hud-height');
      }),
      stepper('Глубина', 'Z', m.d, 150, 800, 20, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.d = v;
        }, 'hud-depth');
      }),
      stepper('От пола', 'Y', m.lift, 0, 2700, 20, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.lift = v;
        }, 'hud-lift');
      }),
    );

    const sameTierMods = store.project.modules.filter((o) => o.id !== m.id && isSameVerticalTier(o, m));
    if (sameTierMods.length > 0) {
      card.append(
        h('button', {
          type: 'button',
          class: 'btn ghost sm',
          style: 'width:100%; font-size:11.5px; padding:4px 8px; margin-top:2px;',
          title: 'Применить эту высоту ко всем шкафам этого яруса (например, ко всем антресолям или верхним шкафам)',
          onClick: () => {
            store.commit((p) => {
              syncTierHeight(p.modules, m.id);
            }, 'hud-sync-tier');
          },
        }, `Выровнять высоту яруса (${m.h} мм)`),
      );
    }

    // Цоколь (единая планка снизу на клипсах)
    const plinthChecked = m.plinth > 0;
    const setRowPlinth = (val: number) => {
      store.commit((p) => {
        for (const mod of p.modules) {
          if (!isWall(mod.kind) && (mod.lift ?? 0) === 0) {
            mod.plinth = val;
          }
        }
      }, 'hud-plinth');
    };
    const plinthRow = h('div', { class: 'hud-row' },
      h('label', { class: 'hud-row-check', title: 'Единый цельный цоколь на клипсах для всего нижнего ряда' },
        h('input', {
          type: 'checkbox',
          checked: plinthChecked,
          onChange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            setRowPlinth(on ? 100 : 0);
          },
        }),
        h('span', null, 'Цоколь снизу'),
      ),
      h('div', { class: 'hud-step-box' },
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !plinthChecked,
          onClick: () => setRowPlinth(Math.max(50, m.plinth - 10)),
        }, '◀'),
        h('span', { class: 'hud-axis' }, 'H'),
        h('input', {
          type: 'number',
          class: 'hud-step-inp',
          value: String(m.plinth),
          disabled: !plinthChecked,
          onInput: (e: Event) => {
            const n = (e.target as HTMLInputElement).valueAsNumber;
            if (Number.isFinite(n) && n >= 0 && n <= 200) {
              setRowPlinth(Math.round(n));
            }
          },
        }),
        h('span', { class: 'hud-unit' }, 'мм'),
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !plinthChecked,
          onClick: () => setRowPlinth(Math.min(200, m.plinth + 10)),
        }, '▶'),
      ),
    );
    card.append(plinthRow);

    // Верхняя доборная планка (карниз под потолок на весь верхний ряд)
    const activeTrimH = getActiveTopTrimH(store.project.modules);
    const trimChecked = activeTrimH > 0;
    const setRowTrim = (val: number) => {
      store.commit((p) => {
        applyTopTrimToUpperRow(p.modules, val);
      }, 'hud-top-trim');
    };
    const trimRow = h('div', { class: 'hud-row' },
      h('label', { class: 'hud-row-check', title: 'Цельная верхняя доборная планка (карниз под потолок) над верхними шкафами и пеналом' },
        h('input', {
          type: 'checkbox',
          checked: trimChecked,
          onChange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            setRowTrim(on ? 60 : 0);
          },
        }),
        h('span', null, 'Планка сверху'),
      ),
      h('div', { class: 'hud-step-box' },
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !trimChecked,
          onClick: () => setRowTrim(Math.max(30, activeTrimH - 10)),
        }, '◀'),
        h('span', { class: 'hud-axis' }, 'H'),
        h('input', {
          type: 'number',
          class: 'hud-step-inp',
          value: String(activeTrimH),
          disabled: !trimChecked,
          onInput: (e: Event) => {
            const n = (e.target as HTMLInputElement).valueAsNumber;
            if (Number.isFinite(n) && n >= 0 && n <= 250) {
              setRowTrim(Math.round(n));
            }
          },
        }),
        h('span', { class: 'hud-unit' }, 'мм'),
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !trimChecked,
          onClick: () => setRowTrim(Math.min(250, activeTrimH + 10)),
        }, '▶'),
      ),
    );
    card.append(trimRow);

    // Действия с модулем (Дублировать, Удалить)
    const actRow = h('div', { class: 'hud-actions' },
      h('button', {
        type: 'button',
        class: 'hud-act-btn',
        title: 'Дублировать модуль',
        onClick: () => store.duplicate(m.id),
      }, icon('copy', 14), 'Дублировать'),
      h('button', {
        type: 'button',
        class: 'hud-act-btn danger',
        title: 'Удалить модуль',
        onClick: () => store.remove(m.id),
      }, icon('trash', 14), 'Удалить'),
      h('button', {
        type: 'button',
        class: 'hud-act-btn ghost',
        title: 'Снять выделение',
        onClick: () => store.select(null),
      }, icon('x', 14)),
    );
    card.append(actRow);

    root.append(card);
  };

  render();

  return {
    update: render,
    destroy: () => root.remove(),
  };
}
