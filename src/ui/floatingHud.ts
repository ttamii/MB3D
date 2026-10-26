import type { Store } from '../app/store';
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
export function createFloatingHud(container: HTMLElement, store: Store, viewer: Viewer): FloatingHud {
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
      stepper('Ширина', 'X', m.w, 300, 3000, 50, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.w = v;
        }, 'hud-width');
      }),
      stepper('Высота', 'Y', m.h, 300, 2800, 50, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.h = v;
        }, 'hud-height');
      }),
      stepper('Глубина', 'Z', m.d, 200, 1200, 50, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.d = v;
        }, 'hud-depth');
      }),
      stepper('От пола', 'Y', m.lift, 0, 2400, 10, (v) => {
        store.commit((p) => {
          const target = p.modules.find((x) => x.id === m.id);
          if (target) target.lift = v;
        }, 'hud-lift');
      }),
    );

    // Цоколь (с чекбоксом)
    const plinthChecked = m.plinth > 0;
    const plinthRow = h('div', { class: 'hud-row' },
      h('label', { class: 'hud-row-check' },
        h('input', {
          type: 'checkbox',
          checked: plinthChecked,
          onChange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            store.commit((p) => {
              const target = p.modules.find((x) => x.id === m.id);
              if (target) target.plinth = on ? 100 : 0;
            }, 'hud-plinth-toggle');
          },
        }),
        h('span', null, 'Цоколь'),
      ),
      h('div', { class: 'hud-step-box' },
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !plinthChecked,
          onClick: () => {
            store.commit((p) => {
              const target = p.modules.find((x) => x.id === m.id);
              if (target) target.plinth = Math.max(50, target.plinth - 10);
            }, 'hud-plinth');
          },
        }, '◀'),
        h('span', { class: 'hud-axis' }, 'H'),
        h('input', {
          type: 'number',
          class: 'hud-step-inp',
          value: String(m.plinth),
          disabled: !plinthChecked,
          onInput: (e: Event) => {
            const n = (e.target as HTMLInputElement).valueAsNumber;
            if (Number.isFinite(n) && n >= 0 && n <= 250) {
              store.commit((p) => {
                const target = p.modules.find((x) => x.id === m.id);
                if (target) target.plinth = n;
              }, 'hud-plinth');
            }
          },
        }),
        h('span', { class: 'hud-unit' }, 'мм'),
        h('button', {
          type: 'button',
          class: 'hud-step-arr',
          disabled: !plinthChecked,
          onClick: () => {
            store.commit((p) => {
              const target = p.modules.find((x) => x.id === m.id);
              if (target) target.plinth = Math.min(250, target.plinth + 10);
            }, 'hud-plinth');
          },
        }, '▶'),
      ),
    );
    card.append(plinthRow);

    // Фасады и ящики
    const hasFac = m.doorMode !== 'none' || m.sections.some((s) => (s.drawers ?? 0) > 0 || s.door);
    if (hasFac) {
      const facRow = h('div', { class: 'hud-row' },
        h('span', { class: 'hud-row-label' }, 'Фасады'),
        h('div', { class: 'hud-facade-btns' },
          h('button', {
            type: 'button',
            class: 'hud-fac-btn',
            title: 'Закрыть фасады и ящики',
            onClick: () => viewer.setOpenRatio(0),
          }, '0% Закр.'),
          h('button', {
            type: 'button',
            class: 'hud-fac-btn',
            title: 'Приоткрыть на 50% для осмотра полок',
            onClick: () => viewer.setOpenRatio(0.5),
          }, '50%'),
          h('button', {
            type: 'button',
            class: 'hud-fac-btn',
            title: 'Открыть настежь на 100%',
            onClick: () => viewer.setOpenRatio(1),
          }, '100% Откр.'),
        ),
      );
      card.append(facRow);
    }

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
