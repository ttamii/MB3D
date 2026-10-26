import type { Estimate } from '../core/estimate';
import { KIND_LABEL } from '../core/defaults';
import { buildModule } from '../core/geometry';
import { computeModuleDrilling } from '../core/drilling';
import { renderAssemblyBlueprintSvg, renderFacadeDrillingSvg, renderSidePanelDrillingSvg } from '../core/blueprint';
import { computeNesting, renderSheetSvg } from '../core/nesting';
import type { Module, Settings } from '../core/types';
import { fmtNum, money } from '../core/util';
import type { Store } from '../app/store';
import type { Viewer } from '../three/viewer';
import { clear, h } from './dom';

export type PrintKind = 'kp' | 'estimate' | 'cut' | 'blueprint';

function describe(m: Module, s: Settings): string {
  const name = (id: string) => s.materials.find((x) => x.id === id)?.name ?? '—';
  const shelves = m.sections.reduce((a, x) => a + x.shelves, 0);
  const drawers = m.sections.reduce((a, x) => a + x.drawers, 0);
  const parts = [
    `${KIND_LABEL[m.kind]} ${m.w}×${m.h}×${m.d} мм`,
    `корпус: ${name(m.matCorpus)}`,
    m.doorMode === 'none' ? 'без дверей' : `фасады: ${name(m.matFacade)}${m.doorMode === 'sliding' ? `, купе ${m.slidingCount} шт` : ''}`,
  ];
  if (m.sections.length > 1) parts.push(`секций: ${m.sections.length}`);
  if (shelves) parts.push(`полок: ${shelves}`);
  if (drawers) parts.push(`ящиков: ${drawers}`);
  if (m.sections.some((x) => x.rod)) parts.push('штанга');
  if (m.countertop) parts.push(`столешница: ${name(m.matTop)}`);
  return parts.join('; ');
}

/** Печать/сохранение в PDF через системный диалог: корректная кириллица без внешних шрифтов. */
export function printDoc(kind: PrintKind, store: Store, est: Estimate, viewer: Viewer, targetModuleId?: string): void {
  const root = document.getElementById('print-root');
  if (!root) return;
  clear(root);
  const s = store.settings;
  const p = store.project;
  const date = new Date();
  const until = new Date(date.getTime() + s.company.validDays * 86400000);
  const fmtD = (d: Date) => d.toLocaleDateString('ru-RU');

  const titles: Record<PrintKind, string> = {
    kp: 'Коммерческое предложение',
    estimate: 'Внутренняя смета',
    cut: 'Деталировка для производства',
    blueprint: 'Сборочные чертежи и карта присадки',
  };

  if (kind === 'blueprint') {
    const modulesToPrint = targetModuleId
      ? p.modules.filter((m) => m.id === targetModuleId)
      : p.modules;

    modulesToPrint.forEach((m) => {
      const built = buildModule(m);
      const drilling = computeModuleDrilling(m, built.parts);

      // ——— Лист 1: Сборочный чертёж + Деталировка ———
      const page1 = h('div', { class: 'pr-page' });
      page1.append(
        h('header', { class: 'pr-head' },
          h('div', null, h('div', { class: 'pr-co' }, s.company.name), h('div', { class: 'pr-sm' }, s.company.phone || 'Производство мебели')),
          h('div', { class: 'pr-r' }, h('div', { class: 'pr-sm' }, `Лист 1 · от ${fmtD(date)}`), h('div', { class: 'pr-sm' }, `Проект: ${p.name}`))),
        h('h1', { class: 'pr-h1' }, `Сборочный чертёж: ${m.name}`),
        h('div', { class: 'pr-proj' }, `Габариты (Ш×В×Г): ${m.w} × ${m.h} × ${m.d} мм · Материал: ${s.materials.find((x) => x.id === m.matCorpus)?.name ?? 'ЛДСП'}`),
      );

      // Векторный сборочный чертёж
      const svgWrap = h('div', { class: 'pr-svg-wrap' });
      svgWrap.innerHTML = renderAssemblyBlueprintSvg(drilling);
      page1.append(svgWrap);

      // Таблица деталировки модуля
      const partRows = drilling.parts.map((dp) => h('tr', null,
        h('td', { class: 'r', style: 'font-weight:700;' }, String(dp.posIndex)),
        h('td', null, dp.name),
        h('td', { class: 'r' }, `${dp.l} × ${dp.w} × ${dp.t}`),
        h('td', { class: 'r' }, String(dp.qty)),
        h('td', null, dp.edgeLabel),
        h('td', null, s.materials.find((x) => x.id === (dp.part.mat === 'facade' ? m.matFacade : m.matCorpus))?.name ?? 'ЛДСП'),
      ));

      page1.append(
        h('h2', { class: 'pr-sub' }, 'Спецификация деталей (раскрой и кромка)'),
        h('table', { class: 'pr-t dense' },
          h('thead', null, h('tr', null, h('th', { class: 'r' }, 'Поз.'), h('th', null, 'Наименование'), h('th', { class: 'r' }, 'Размеры (мм)'), h('th', { class: 'r' }, 'Шт'), h('th', null, 'Кромка'), h('th', null, 'Материал'))),
          h('tbody', null, ...partRows),
        ),
      );

      // Таблица фурнитуры модуля
      const hwEntries = Object.entries(built.hardware);
      if (hwEntries.length > 0) {
        const hwCols = hwEntries.map(([k, qty]) => {
          const item = s.hardware[k];
          return `${item?.name ?? k}: ${qty} ${item?.unit ?? 'шт'}`;
        }).join('  ·  ');
        page1.append(h('div', { class: 'pr-note', style: 'margin-top:10px; font-weight:600;' }, `Фурнитура на модуль: ${hwCols}`));
      }

      root.append(page1);

      // ——— Лист 2: Присадка фасадов (вид изнутри) ———
      if (drilling.facades.length > 0) {
        const page2 = h('div', { class: 'pr-page' });
        page2.append(
          h('header', { class: 'pr-head' },
            h('div', null, h('div', { class: 'pr-co' }, s.company.name)),
            h('div', { class: 'pr-r' }, h('div', { class: 'pr-sm' }, `Лист 2 · Фасады · ${fmtD(date)}`))),
          h('h1', { class: 'pr-h1' }, `Фасады: Присадка петель и ручек`),
          h('div', { class: 'pr-proj' }, `Модуль: ${m.name} · Чашки петель Ø35 мм (глубина 11.5 мм, отступ от кромки 21.5 мм)`),
        );

        const facadesWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:20px; justify-content:center; margin:16px 0;' });
        drilling.facades.forEach((f) => {
          const fBox = h('div', { style: 'text-align:center;' });
          fBox.innerHTML = renderFacadeDrillingSvg(f);
          facadesWrap.append(fBox);
        });
        page2.append(facadesWrap);
        root.append(page2);
      }

      // ——— Лист 3: Сверловка боковин корпуса ———
      if (drilling.sides.length > 0) {
        const page3 = h('div', { class: 'pr-page' });
        page3.append(
          h('header', { class: 'pr-head' },
            h('div', null, h('div', { class: 'pr-co' }, s.company.name)),
            h('div', { class: 'pr-r' }, h('div', { class: 'pr-sm' }, `Лист 3 · Сверловка корпуса · ${fmtD(date)}`))),
          h('h1', { class: 'pr-h1' }, `Сверловка боковин корпуса`),
          h('div', { class: 'pr-proj' }, `Отверстия под конфирматы 7×50, ответные планки петель (отступ 37 мм, шаг 32 мм) и полкодержатели Ø5 мм`),
        );

        const sidesWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:20px; justify-content:center; margin:16px 0;' });
        drilling.sides.forEach((side) => {
          const sBox = h('div', { style: 'text-align:center;' });
          sBox.innerHTML = renderSidePanelDrillingSvg(side);
          sidesWrap.append(sBox);
        });
        page3.append(sidesWrap);

        const tablesWrap = h('div', { style: 'margin-top:14px; display:flex; flex-direction:column; gap:12px;' });
        drilling.sides.forEach((side) => {
          if (!side.holes.length) return;
          const rows = side.holes.map((hole, hIdx) => {
            let drillLabel = `Ø${hole.diam} мм`;
            if (hole.depth) drillLabel += ` (гл. ${hole.depth} мм)`;
            return h('tr', null,
              h('td', { class: 'r', style: 'font-weight:700;' }, String(hIdx + 1)),
              h('td', null, hole.desc),
              h('td', { class: 'r', style: 'font-weight:600;' }, drillLabel),
              h('td', { class: 'r' }, `${hole.x} мм`),
              h('td', { class: 'r' }, `${hole.y} мм`),
            );
          });
          const tableBox = h('div', null,
            h('div', { style: 'font-weight:700; font-size:10pt; margin-bottom:4px; color:#1e293b;' }, `Координатная таблица: ${side.name}`),
            h('table', { class: 'pr-t dense' },
              h('thead', null, h('tr', null,
                h('th', { class: 'r' }, '№'),
                h('th', null, 'Крепёж / Фурнитура'),
                h('th', { class: 'r' }, 'Сверло / Глубина'),
                h('th', { class: 'r' }, 'X (сзади)'),
                h('th', { class: 'r' }, 'Y (снизу)'),
              )),
              h('tbody', null, ...rows),
            ),
          );
          tablesWrap.append(tableBox);
        });
        page3.append(tablesWrap);
        root.append(page3);
      }
    });

  } else {
    // ——— Обычные отчеты (КП, Смета, Деталировка) ———
    root.append(h('header', { class: 'pr-head' },
      h('div', null, h('div', { class: 'pr-co' }, s.company.name), s.company.phone ? h('div', { class: 'pr-sm' }, s.company.phone) : null),
      h('div', { class: 'pr-r' }, h('div', { class: 'pr-sm' }, `от ${fmtD(date)}`), kind === 'kp' ? h('div', { class: 'pr-sm' }, `действительно до ${fmtD(until)}`) : null)),
    h('h1', { class: 'pr-h1' }, titles[kind]),
    h('div', { class: 'pr-proj' }, `Проект: ${p.name}`));

    if (kind === 'kp') {
      try {
        root.append(h('img', { class: 'pr-img', alt: 'Визуализация проекта', src: viewer.snapshot(1600, 900) }));
      } catch { /* без картинки */ }
      root.append(
        h('table', { class: 'pr-t' },
          h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, 'Наименование'), h('th', { class: 'r' }, 'Цена'))),
          h('tbody', null, ...p.modules.map((m, i) => h('tr', null,
            h('td', null, String(i + 1)),
            h('td', null, h('b', null, m.name), h('div', { class: 'pr-sm' }, describe(m, s))),
            h('td', { class: 'r' }, money(est.perModule[m.id] ?? 0))))),
          h('tfoot', null, h('tr', null, h('td', { colspan: '2' }, 'ИТОГО'), h('td', { class: 'r' }, money(est.total))))));
      if (s.company.note) {
        root.append(h('p', { class: 'pr-note' }, s.company.note));
      }
    } else if (kind === 'estimate') {
      const rows = (title: string, list: { name: string; qty: number; unit: string; cost: number }[]) => [
        h('tr', { class: 'g' }, h('td', { colspan: '3' }, title)),
        ...list.map((l) => h('tr', null, h('td', null, l.name), h('td', { class: 'r' }, `${fmtNum(l.qty)} ${l.unit}`), h('td', { class: 'r' }, money(l.cost)))),
      ];
      root.append(h('table', { class: 'pr-t' },
        h('thead', null, h('tr', null, h('th', null, 'Статья'), h('th', { class: 'r' }, 'Кол-во'), h('th', { class: 'r' }, 'Сумма'))),
        h('tbody', null,
          ...rows('Материалы', [...est.materials, est.edge]),
          ...rows('Фурнитура', est.hardware),
          ...rows('Работы', est.labor.map((l) => ({ ...l, qty: 0, unit: '' }))),
          h('tr', null, h('td', null, `Наценка (${s.labor.markup}%)`), h('td'), h('td', { class: 'r' }, money(est.markup)))),
        h('tfoot', null, h('tr', null, h('td', { colspan: '2' }, 'ИТОГО'), h('td', { class: 'r' }, money(est.total))))));
    } else if (kind === 'cut') {
      const rows = [...est.cut].sort((a, b) => a.matName.localeCompare(b.matName, 'ru') || a.moduleName.localeCompare(b.moduleName, 'ru') || b.l - a.l);
      root.append(h('table', { class: 'pr-t dense' },
        h('thead', null, h('tr', null, ...['№', 'Модуль', 'Деталь', 'Длина', 'Ширина', 'Т', 'Шт', 'Материал', 'Кромка, мм'].map((t) => h('th', null, t)))),
        h('tbody', null, ...rows.map((r, i) => h('tr', null,
          h('td', null, String(i + 1)), h('td', null, r.moduleName), h('td', null, r.name), h('td', null, String(r.l)), h('td', null, String(r.w)),
          h('td', null, String(r.t)), h('td', null, String(r.qty)), h('td', null, r.matName), h('td', null, String(Math.round(r.edgeMm))))))));

      const nesting = computeNesting(rows, s.materials);
      nesting.sheets.forEach((sheet) => {
        const sheetPage = h('div', { class: 'pr-page', style: 'page-break-before:always;' });
        sheetPage.append(
          h('header', { class: 'pr-head' },
            h('div', null, h('div', { class: 'pr-co' }, s.company.name)),
            h('div', { class: 'pr-r' }, h('div', { class: 'pr-sm' }, `Карта раскроя · Лист ${sheet.sheetIndex}/${nesting.totalSheets} · ${fmtD(date)}`))),
          h('h1', { class: 'pr-h1' }, `Карта раскроя: ${sheet.matName} (${sheet.format.w}×${sheet.format.h} мм)`),
          h('div', { class: 'pr-proj' }, `Лист ${sheet.sheetIndex} из ${nesting.totalSheets} · КУМ: ${sheet.efficiencyPercent}% · Деталей: ${sheet.parts.length} шт · Полезная площадь: ${sheet.usedAreaM2} м²`),
        );
        const svgBox = h('div', { class: 'pr-svg-wrap' });
        svgBox.innerHTML = renderSheetSvg(sheet);
        sheetPage.append(svgBox);
        root.append(sheetPage);
      });
    }
  }

  document.title = `${titles[kind]} — ${p.name}`;
  const prev = 'Mebel3D';
  const done = () => { clear(root); document.title = prev; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 80);
}
