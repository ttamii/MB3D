import { estimate, type Estimate, cutListCsv } from '../core/estimate';
import { buildModule } from '../core/geometry';
import { computeModuleDrilling } from '../core/drilling';
import { renderAssemblyBlueprintSvg, renderFacadeDrillingSvg, renderSidePanelDrillingSvg } from '../core/blueprint';
import { generateKitchenLayout } from '../core/kitchenWizard';
import { DEFAULT_ROOM, renderRoomPlanSvg, type RoomConfig } from '../core/room';
import type { Settings } from '../core/types';
import { downloadBlob, fileName, fmtNum, money } from '../core/util';
import {
  deleteFromLibrary, encodeShare, loadLibrary, projectFromJson, projectToJson, saveToLibrary,
} from '../core/storage';
import type { Store } from '../app/store';
import type { Viewer } from '../three/viewer';
import { append, clear, h, icon } from './dom';
import { printDoc } from './print';

// ——— базовый диалог ———

export interface Dlg {
  el: HTMLDialogElement;
  body: HTMLElement;
  foot: HTMLElement;
  close: () => void;
}

export function openDialog(title: string, opts: { wide?: boolean } = {}): Dlg {
  const body = h('div', { class: 'dlg-body' });
  const foot = h('div', { class: 'dlg-foot' });
  const el = h('dialog', { class: 'dlg' + (opts.wide ? ' wide' : ''), 'aria-label': title });
  const close = () => { if (el.open) el.close(); };
  el.append(
    h('div', { class: 'dlg-head' }, h('h2', null, title), h('button', { type: 'button', class: 'ib', 'aria-label': 'Закрыть', onClick: close }, icon('x', 18))),
    body, foot);
  el.addEventListener('close', () => el.remove());
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.body.appendChild(el);
  el.showModal();
  return { el, body, foot, close };
}

export function toast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

const btn = (label: string, cls: string, on: () => void, ic?: string) =>
  h('button', { type: 'button', class: 'btn ' + cls, onClick: on }, ic ? icon(ic, 16) : null, label);

// ——— смета ———

export function estimateDialog(store: Store, est: Estimate, viewer: Viewer): void {
  const d = openDialog('Смета и КП', { wide: true });
  const cur = '₸';
  const row = (name: string, qty: string, cost: number, cls = '') =>
    h('tr', { class: cls }, h('td', null, name), h('td', { class: 'r' }, qty), h('td', { class: 'r' }, money(cost, cur)));

  const mods = store.project.modules;
  const t1 = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Модуль'), h('th', { class: 'r' }, 'Размер, мм'), h('th', { class: 'r' }, 'Цена'))),
    h('tbody', null, ...mods.map((m) => h('tr', null, h('td', null, m.name), h('td', { class: 'r' }, `${m.w}×${m.h}×${m.d}`), h('td', { class: 'r' }, money(est.perModule[m.id] ?? 0, cur))))));

  const t2 = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Статья расходов'), h('th', { class: 'r' }, 'Кол-во'), h('th', { class: 'r' }, 'Сумма'))),
    h('tbody', null,
      h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, 'Материалы (с учётом отходов)')),
      ...est.materials.map((l) => row(l.name, `${fmtNum(l.qty)} ${l.unit}`, l.cost)),
      row(est.edge.name, `${fmtNum(est.edge.qty)} ${est.edge.unit}`, est.edge.cost),
      h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, 'Фурнитура')),
      ...est.hardware.map((l) => row(l.name, `${fmtNum(l.qty)} ${l.unit}`, l.cost)),
      h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, 'Работы')),
      ...est.labor.map((l) => row(l.name, '', l.cost)),
      row(`Наценка (${store.settings.labor.markup}%)`, '', est.markup),
    ));

  d.body.append(
    h('div', { class: 'est-total' }, h('span', null, 'Итого'), h('b', null, money(est.total, cur))),
    h('p', { class: 'hint' }, `Площадь плитных материалов: ${fmtNum(est.area)} м² (без отходов). Цены и проценты настраиваются в «Настройках».`),
    h('div', { class: 'scroll-x' }, t1), h('div', { class: 'scroll-x' }, t2));

  d.foot.append(
    btn('КП для клиента (PDF)', 'primary', () => { d.close(); printDoc('kp', store, est, viewer); }, 'printer'),
    btn('Внутренняя смета (PDF)', 'ghost', () => { d.close(); printDoc('estimate', store, est, viewer); }, 'list'),
  );
}

// ——— деталировка ———

export function cutDialog(store: Store, est: Estimate, viewer: Viewer): void {
  const d = openDialog('Деталировка для цеха', { wide: true });
  const rows = [...est.cut].sort((a, b) => a.matName.localeCompare(b.matName, 'ru') || b.l - a.l);
  const pieces = rows.reduce((s, r) => s + r.qty, 0);

  d.body.append(
    h('p', { class: 'hint' }, `${rows.length} позиций · ${pieces} деталей. Размеры в мм: длина × ширина × толщина. Для станка скачайте CSV.`),
    h('div', { class: 'scroll-x' },
      h('table', { class: 'tbl dense' },
        h('thead', null, h('tr', null, ...['№', 'Модуль', 'Деталь', 'Длина', 'Ширина', 'Т', 'Шт', 'Материал', 'Кромка, мм'].map((t, i) => h('th', { class: i >= 3 && i !== 7 ? 'r' : '' }, t)))),
        h('tbody', null, ...rows.map((r, i) => h('tr', null,
          h('td', null, String(i + 1)), h('td', null, r.moduleName), h('td', null, r.name),
          h('td', { class: 'r' }, String(r.l)), h('td', { class: 'r' }, String(r.w)), h('td', { class: 'r' }, String(r.t)),
          h('td', { class: 'r' }, String(r.qty)), h('td', null, r.matName), h('td', { class: 'r' }, String(Math.round(r.edgeMm)))))))));

  d.foot.append(
    btn('Скачать CSV', 'primary', () => downloadBlob(new Blob([cutListCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${fileName(store.project.name)}-detalirovka.csv`), 'download'),
    btn('Печать / PDF', 'ghost', () => { d.close(); printDoc('cut', store, est, viewer); }, 'printer'));
}

// ——— сборочный чертёж и карта присадки ———

export function blueprintDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('Сборочный чертёж и карта присадки', { wide: true });
  const mods = store.project.modules;
  if (!mods.length) {
    d.body.append(h('p', { class: 'empty' }, 'В проекте пока нет модулей. Добавьте модуль в левой панели.'));
    return;
  }

  let selectedModId = store.selectedId && mods.some((m) => m.id === store.selectedId) ? store.selectedId : mods[0].id;
  let activeTab: 'assembly' | 'facades' | 'sides' = 'assembly';

  const container = h('div', { class: 'bp-container' });

  const renderContent = () => {
    clear(container);
    const m = mods.find((x) => x.id === selectedModId) ?? mods[0];
    const built = buildModule(m);
    const drilling = computeModuleDrilling(m, built.parts);

    const modSelect = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;' },
      h('div', { style: 'display:flex; align-items:center; gap:8px;' },
        h('span', { style: 'font-weight:600; font-size:13px; color:var(--text);' }, 'Модуль:'),
        h('select', {
          style: 'padding:6px 12px; border-radius:6px; border:1px solid var(--line); background:var(--card); color:var(--text); font-weight:600;',
          onChange: (e: Event) => {
            selectedModId = (e.target as HTMLSelectElement).value;
            renderContent();
          },
        }, ...mods.map((mod) => h('option', { value: mod.id, selected: mod.id === selectedModId }, `${mod.name} (${mod.w}×${mod.h}×${mod.d} мм)`))),
      ),
      h('div', { style: 'display:flex; gap:6px;' },
        h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'assembly' ? ' on' : ''),
          onClick: () => { activeTab = 'assembly'; renderContent(); },
        }, '1. Сборочный чертёж'),
        drilling.facades.length > 0 ? h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'facades' ? ' on' : ''),
          onClick: () => { activeTab = 'facades'; renderContent(); },
        }, '2. Присадка фасадов') : null,
        drilling.sides.length > 0 ? h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'sides' ? ' on' : ''),
          onClick: () => { activeTab = 'sides'; renderContent(); },
        }, '3. Сверловка боковин') : null,
      ),
    );

    container.append(modSelect);

    if (activeTab === 'assembly') {
      const svgBox = h('div', { style: 'margin-bottom:16px;' });
      svgBox.innerHTML = renderAssemblyBlueprintSvg(drilling);

      const partRows = drilling.parts.map((dp) => h('tr', null,
        h('td', { class: 'r', style: 'font-weight:700;' }, String(dp.posIndex)),
        h('td', null, dp.name),
        h('td', { class: 'r' }, `${dp.l} × ${dp.w} × ${dp.t}`),
        h('td', { class: 'r' }, String(dp.qty)),
        h('td', null, dp.edgeLabel),
        h('td', null, store.settings.materials.find((x) => x.id === (dp.part.mat === 'facade' ? m.matFacade : m.matCorpus))?.name ?? 'ЛДСП'),
      ));

      const tbl = h('div', { class: 'scroll-x', style: 'margin-top:12px;' },
        h('table', { class: 'tbl dense' },
          h('thead', null, h('tr', null, h('th', { class: 'r' }, 'Поз.'), h('th', null, 'Наименование детали'), h('th', { class: 'r' }, 'Размеры (мм)'), h('th', { class: 'r' }, 'Шт'), h('th', null, 'Кромка'), h('th', null, 'Материал'))),
          h('tbody', null, ...partRows),
        ),
      );

      const hwEntries = Object.entries(built.hardware);
      const hwBlock = hwEntries.length > 0 ? h('div', { class: 'hint', style: 'margin-top:10px;' },
        h('b', null, 'Фурнитура на модуль: '),
        hwEntries.map(([k, qty]) => `${store.settings.hardware[k]?.name ?? k}: ${qty} шт`).join(', '),
      ) : null;

      container.append(
        h('p', { class: 'hint' }, 'Аксонометрия с номерами позиций ①..Ⓝ. Стрелки указывают на детали в спецификации.'),
        svgBox, tbl,
      );
      if (hwBlock) container.append(hwBlock);
    } else if (activeTab === 'facades') {
      const facadesWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:20px; justify-content:center; margin:14px 0;' });
      drilling.facades.forEach((f) => {
        const fBox = h('div', { style: 'text-align:center;' });
        fBox.innerHTML = renderFacadeDrillingSvg(f);
        facadesWrap.append(fBox);
      });
      container.append(
        h('p', { class: 'hint' }, 'Вид изнутри: фрезеровка чашек петель Ø35 мм (глубина 11.5 мм, отступ от кромки 21.5 мм) и присадка ручек 128 мм.'),
        facadesWrap,
      );
    } else if (activeTab === 'sides') {
      const sidesWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:20px; justify-content:center; margin:14px 0;' });
      drilling.sides.forEach((side) => {
        const sBox = h('div', { style: 'text-align:center;' });
        sBox.innerHTML = renderSidePanelDrillingSvg(side);
        sidesWrap.append(sBox);
      });
      container.append(
        h('p', { class: 'hint' }, 'Сверловка боковин: отверстия под евровинты-конфирматы 7×50, ответные планки петель (37 мм от кромки) и полкодержатели Ø5 мм.'),
        sidesWrap,
      );
    }
  };

  renderContent();
  d.body.append(container);

  const est = estimate(store.project.modules, store.settings);
  d.foot.append(
    btn('Печать чертежей модуля (PDF)', 'primary', () => { d.close(); printDoc('blueprint', store, est, viewer, selectedModId); }, 'printer'),
    btn('Альбом всех модулей (PDF)', 'ghost', () => { d.close(); printDoc('blueprint', store, est, viewer); }, 'printer'),
    btn('Деталировка CSV', 'ghost', () => {
      const rows = [...est.cut].sort((a, b) => a.matName.localeCompare(b.matName, 'ru') || b.l - a.l);
      downloadBlob(new Blob([cutListCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${fileName(store.project.name)}-detalirovka.csv`);
    }, 'download'),
  );
}

// ——— настройки ———

export function settingsDialog(store: Store): void {
  const d = openDialog('Настройки цен и компании', { wide: true });
  const s: Settings = structuredClone(store.settings);

  const numIn = (value: number, on: (v: number) => void, step = 1, max = 10_000_000) =>
    h('input', { type: 'number', min: '0', max, step, value: String(value), inputmode: 'decimal', onChange: (e: Event) => { const v = (e.target as HTMLInputElement).valueAsNumber; if (Number.isFinite(v)) on(Math.min(max, Math.max(0, v))); } });
  const txt = (value: string, on: (v: string) => void, max = 60) =>
    h('input', { type: 'text', maxlength: String(max), value, onInput: (e: Event) => on((e.target as HTMLInputElement).value) });
  const fld = (l: string, c: HTMLElement) => h('label', { class: 'fld wide' }, h('span', { class: 'fld-l' }, l), c);

  const company = h('section', { class: 'grp' }, h('h3', null, 'Компания (для КП)'),
    fld('Название', txt(s.company.name, (v) => (s.company.name = v))),
    fld('Телефон / WhatsApp', txt(s.company.phone, (v) => (s.company.phone = v), 30)),
    fld('Примечание в КП', txt(s.company.note, (v) => (s.company.note = v), 240)),
    fld('Срок действия КП, дней', numIn(s.company.validDays, (v) => (s.company.validDays = v), 1, 365)));

  const labor = h('section', { class: 'grp' }, h('h3', null, 'Работы и наценка, %'),
    h('div', { class: 'grid2' },
      fld('Цех', numIn(s.labor.shop, (v) => (s.labor.shop = v), 1, 300)),
      fld('Сборка', numIn(s.labor.assembly, (v) => (s.labor.assembly = v), 1, 300)),
      fld('Технолог', numIn(s.labor.tech, (v) => (s.labor.tech = v), 1, 300)),
      fld('Логистика', numIn(s.labor.logistics, (v) => (s.labor.logistics = v), 1, 300)),
      fld('Наценка', numIn(s.labor.markup, (v) => (s.labor.markup = v), 1, 500)),
      fld('Отходы материала, %', numIn(s.waste, (v) => (s.waste = v), 1, 60)),
      fld('Кромка, ₸/м', numIn(s.edgePrice, (v) => (s.edgePrice = v), 10, 100000))));

  const matRows = s.materials.map((m) => h('tr', null,
    h('td', null, h('span', { class: 'sw', style: `background:${/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ccc'}` }), txt(m.name, (v) => (m.name = v))),
    h('td', null, numIn(m.price, (v) => (m.price = v), 100))));
  const mats = h('section', { class: 'grp' }, h('h3', null, 'Материалы, ₸ за м²'), h('div', { class: 'scroll-x' }, h('table', { class: 'tbl form' }, h('tbody', null, ...matRows))));

  const hwRows = Object.entries(s.hardware).map(([, it]) => h('tr', null, h('td', null, it.name + `, ₸/${it.unit}`), h('td', null, numIn(it.price, (v) => (it.price = v), 10))));
  const hw = h('section', { class: 'grp' }, h('h3', null, 'Фурнитура'), h('div', { class: 'scroll-x' }, h('table', { class: 'tbl form' }, h('tbody', null, ...hwRows))));

  d.body.append(h('div', { class: 'cols2' }, h('div', null, company, labor), h('div', null, hw)), mats);
  d.foot.append(
    btn('Сбросить к стандартным', 'ghost', () => { if (confirm('Вернуть все цены и настройки к стандартным значениям?')) { store.setSettings(null); d.close(); toast('Настройки сброшены'); } }),
    btn('Сохранить', 'primary', () => { store.setSettings(s); d.close(); toast('Настройки сохранены'); }, 'check'));
}

// ——— проекты ———

export function projectsDialog(store: Store, onChanged: () => void): void {
  const d = openDialog('Проекты');
  const listHost = h('div', { class: 'proj-list' });

  const refresh = () => {
    clear(listHost);
    const lib = loadLibrary(store.settings);
    if (!lib.length) listHost.append(h('p', { class: 'empty' }, 'Сохранённых проектов пока нет.'));
    for (const p of lib) {
      listHost.append(h('div', { class: 'proj' },
        h('div', null, h('b', null, p.name), h('small', null, `${p.modules.length} мод. · ${new Date(p.updatedAt).toLocaleString('ru-RU')}`)),
        h('div', { class: 'proj-a' },
          btn('Открыть', 'sm primary', () => { store.loadProject(p); d.close(); toast('Проект открыт'); }),
          h('button', { type: 'button', class: 'ib danger', 'aria-label': 'Удалить проект', onClick: () => { if (confirm(`Удалить проект «${p.name}»?`)) { deleteFromLibrary(p.id, store.settings); refresh(); } } }, icon('trash', 16)))));
    }
  };
  refresh();

  const file = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onChange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (f.size > 2_000_000) return toast('Файл слишком большой', 'err');
      const p = projectFromJson(await f.text(), store.settings);
      if (!p) return toast('Не удалось прочитать проект', 'err');
      store.loadProject(p);
      d.close();
      toast('Проект импортирован');
    },
  });

  d.body.append(
    h('div', { class: 'row-btns' },
      btn('Сохранить текущий', 'primary', () => { if (saveToLibrary(store.project, store.settings)) { toast('Проект сохранён'); refresh(); onChanged(); } else toast('Не хватает места в браузере', 'err'); }, 'check'),
      btn('Новый', 'ghost', () => { if (!store.project.modules.length || confirm('Начать новый проект? Несохранённые изменения останутся только в автосохранении.')) { store.newProject(); d.close(); } }, 'plus')),
    listHost, file);
  d.foot.append(
    btn('Импорт из файла', 'ghost', () => file.click(), 'upload'),
    btn('Экспорт в файл', 'ghost', () => downloadBlob(new Blob([projectToJson(store.project)], { type: 'application/json' }), `${fileName(store.project.name)}.mebel3d.json`), 'download'));
}

// ——— фото-рендер ———

export function renderDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('Фото-рендер', { wide: true });
  const small = Math.min(screen.width, screen.height) < 700;
  const [W, H] = small ? [1600, 900] : [2560, 1440];
  const status = h('p', { class: 'hint' }, 'Готовим изображение…');
  const holder = h('div', { class: 'render-box' });
  d.body.append(status, holder);

  requestAnimationFrame(() => setTimeout(() => {
    try {
      const url = viewer.snapshot(W, H);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        g.font = `600 ${Math.round(H / 48)}px Inter, system-ui, sans-serif`;
        g.fillStyle = 'rgba(30,30,34,.55)';
        g.textAlign = 'right';
        g.fillText(store.settings.company.name, W - H / 40, H - H / 40);
        const out = c.toDataURL('image/png');
        holder.append(h('img', { src: out, alt: 'Фото-рендер проекта' }));
        status.textContent = `Готово: ${W}×${H}px. Откройте двери кнопкой «Открыть» и сделайте рендер ещё раз, если нужен ракурс с открытыми фасадами.`;
        d.foot.append(btn('Скачать PNG', 'primary', () => c.toBlob((b) => b && downloadBlob(b, `${fileName(store.project.name)}-render.png`), 'image/png'), 'download'));
      };
      img.src = url;
    } catch {
      status.textContent = 'Не удалось создать изображение на этом устройстве. Попробуйте на компьютере.';
    }
  }, 30));
}

// ——— AR ———

export function arDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('Просмотр в AR', { wide: true });
  const host = h('div', { class: 'ar-box' }, h('p', { class: 'hint' }, 'Готовим 3D-модель…'));
  d.body.append(host,
    h('p', { class: 'hint' }, 'Нажмите «Посмотреть в вашей комнате» на телефоне — мебель появится в реальном размере на полу. На компьютере можно вращать модель. AR работает только по HTTPS (на опубликованном сайте) — Android: ARCore, iPhone: Quick Look.'));

  let url = '';
  d.el.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); });
  (async () => {
    try {
      const [blob] = await Promise.all([viewer.exportGLB(), import('@google/model-viewer')]);
      url = URL.createObjectURL(blob);
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', url);
      mv.setAttribute('alt', store.project.name);
      mv.setAttribute('ar', '');
      mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
      mv.setAttribute('ar-placement', 'floor');
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('touch-action', 'pan-y');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('exposure', '1');
      mv.setAttribute('environment-image', 'neutral');
      mv.className = 'mv';
      const arBtn = h('button', { slot: 'ar-button', type: 'button', class: 'btn primary ar-btn' }, icon('cube', 16), 'Посмотреть в вашей комнате');
      mv.append(arBtn);
      clear(host);
      host.append(mv);
    } catch {
      clear(host);
      host.append(h('p', { class: 'hint' }, 'Не удалось подготовить модель для AR.'));
    }
  })();
  d.foot.append(btn('Скачать GLB', 'ghost', async () => downloadBlob(await viewer.exportGLB(), `${fileName(store.project.name)}.glb`), 'download'));
}

// ——— ссылка клиенту ———

export function shareDialog(store: Store): void {
  const d = openDialog('Ссылка для клиента');
  const input = h('input', { type: 'text', readonly: true, class: 'share-in', 'aria-label': 'Ссылка' });
  d.body.append(
    h('p', { class: 'hint' }, 'Клиент увидит 3D-модель, сможет открыть двери и посмотреть мебель в AR. Цены и смета в ссылку не попадают. Данные хранятся в самой ссылке — сервер не нужен.'),
    input);
  encodeShare(store.project, store.settings).then((tok) => {
    const u = new URL(location.href);
    u.hash = 'v=' + tok;
    u.pathname = u.pathname.replace(/[^/]*$/, 'constructor.html');
    input.value = u.toString();
    input.select();
  });
  d.foot.append(
    btn('Скопировать', 'primary', async () => {
      try { await navigator.clipboard.writeText(input.value); toast('Ссылка скопирована'); }
      catch { input.select(); document.execCommand('copy'); toast('Ссылка скопирована'); }
    }, 'link'),
    ...(navigator.share ? [btn('Поделиться', 'ghost', () => navigator.share({ title: store.project.name, url: input.value }).catch(() => {}))] : [])
  );
}

export function helpDialog(): void {
  const d = openDialog('Как пользоваться');
  const li = (t: string) => h('li', null, t);
  d.body.append(h('ul', { class: 'help' },
    li('Выберите готовый модуль в левой панели — он появится в 3D-сцене.'),
    li('Кликните по мебели в сцене или в списке, чтобы редактировать размеры, секции, ящики и фасады справа.'),
    li('Колёсико — масштаб, левая кнопка — вращение, правая (или два пальца) — сдвиг.'),
    li('«Смета» считает стоимость по вашим ценам, «Детали» — раскрой для цеха.'),
    li('Проект сохраняется автоматически в браузере. Для хранения нескольких — кнопка «Проекты».'),
    li('Ctrl+Z / Ctrl+Y — отмена и повтор.')));
  append(d.foot, [btn('Понятно', 'primary', d.close)]);
}

// ——— Мастер авто-планировки кухни в 1 клик ———

export function kitchenWizardDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('Мастер кухни (авто-планировка)', { wide: true });
  const s = store.settings;
  const facadeMats = s.materials.filter((m) => m.kind === 'facade' || m.kind === 'sheet');
  const corpusMats = s.materials.filter((m) => m.kind === 'sheet');
  const topMats = s.materials.filter((m) => m.kind === 'top');

  let wallLength = 3000;
  let tiers: 2 | 3 = 3;
  let facadeMat = facadeMats.find((m) => m.id === 'm-ral1015')?.id ?? facadeMats[0]?.id ?? 'eg-w1000';
  let corpusMat = corpusMats.find((m) => m.id === 'eg-w1000')?.id ?? corpusMats[0]?.id ?? 'eg-w1000';
  let topMat = topMats.find((m) => m.id === 'top-f812')?.id ?? topMats[0]?.id ?? 'top-f812';
  let plinthColor: 'facade' | 'corpus' = 'facade';
  let millingMix: 'trend' | 'modern' | 'frame' | 'ribbed' = 'trend';
  let layoutVariant = 0; // 0: пенал слева, 1: пенал справа, 2: без пенала

  const container = h('div', { class: 'wizard-body', style: 'display:flex; flex-direction:column; gap:16px;' });

  const renderContent = () => {
    clear(container);

    const desc = h('div', { style: 'background:rgba(59,130,246,0.08); border-left:4px solid #3b82f6; padding:10px 14px; border-radius:6px; font-size:13px; line-height:1.5; color:#1e293b;' },
      h('b', null, 'Справка технолога: '),
      'Вводите длину стены, и алгоритм расставляет модули с учётом мебельных стандартов: пенал под встройку, мойка с сантехническим пространством, посудосушитель, ящики и антресоли.',
    );

    // Длина стены
    const wallLenWrap = h('div', { class: 'grp' },
      h('h3', null, '1. Длина стены (мм)'),
      h('div', { class: 'btn-bar', style: 'margin-bottom:8px;' },
        ...[2400, 3000, 3600, 4200].map((len) =>
          h('button', {
            class: `btn sm ${wallLength === len ? 'primary' : 'ghost'}`,
            onClick: () => { wallLength = len; renderContent(); },
          }, `${len} мм`),
        ),
      ),
      h('label', { class: 'fld' },
        h('span', { class: 'fld-l' }, 'Точный размер стены'),
        h('input', {
          type: 'number', min: '1600', max: '6000', step: '50', value: String(wallLength),
          onInput: (e: Event) => {
            const val = (e.target as HTMLInputElement).valueAsNumber;
            if (val >= 1600 && val <= 6000) wallLength = val;
          },
        }),
      ),
    );

    // Ярусы
    const tiersWrap = h('div', { class: 'grp' },
      h('h3', null, '2. Конфигурация ярусов'),
      h('div', { class: 'btn-bar' },
        h('button', {
          class: `btn sm ${tiers === 3 ? 'primary' : 'ghost'}`,
          onClick: () => { tiers = 3; renderContent(); },
        }, '3 яруса (Низ + Верх 720 мм + Антресоли push-to-open)'),
        h('button', {
          class: `btn sm ${tiers === 2 ? 'primary' : 'ghost'}`,
          onClick: () => { tiers = 2; renderContent(); },
        }, '2 яруса (Низ + Верх 720 мм)'),
      ),
    );

    // Фрезеровка
    const millingWrap = h('div', { class: 'grp' },
      h('h3', null, '3. Фрезеровка фасадов'),
      h('div', { class: 'btn-bar', style: 'flex-wrap:wrap; gap:6px;' },
        h('button', {
          class: `btn sm ${millingMix === 'trend' ? 'primary' : 'ghost'}`,
          onClick: () => { millingMix = 'trend'; renderContent(); },
        }, 'Комбинированный (низ рамка, верх модерн, антресоль рифлёная)'),
        h('button', {
          class: `btn sm ${millingMix === 'modern' ? 'primary' : 'ghost'}`,
          onClick: () => { millingMix = 'modern'; renderContent(); },
        }, 'Модерн (гладкие)'),
        h('button', {
          class: `btn sm ${millingMix === 'frame' ? 'primary' : 'ghost'}`,
          onClick: () => { millingMix = 'frame'; renderContent(); },
        }, 'Рамка (классика/шакер)'),
        h('button', {
          class: `btn sm ${millingMix === 'ribbed' ? 'primary' : 'ghost'}`,
          onClick: () => { millingMix = 'ribbed'; renderContent(); },
        }, 'Рифлёный вельвет'),
      ),
    );

    // Материалы
    const matsWrap = h('div', { class: 'grp' },
      h('h3', null, '4. Материалы и цвета'),
      h('div', { class: 'grid2' },
        h('label', { class: 'fld' },
          h('span', { class: 'fld-l' }, 'Фасады'),
          h('select', {
            onChange: (e: Event) => { facadeMat = (e.target as HTMLSelectElement).value; },
          }, ...facadeMats.map((m) => h('option', { value: m.id, selected: m.id === facadeMat }, m.name))),
        ),
        h('label', { class: 'fld' },
          h('span', { class: 'fld-l' }, 'Корпус'),
          h('select', {
            onChange: (e: Event) => { corpusMat = (e.target as HTMLSelectElement).value; },
          }, ...corpusMats.map((m) => h('option', { value: m.id, selected: m.id === corpusMat }, m.name))),
        ),
        h('label', { class: 'fld' },
          h('span', { class: 'fld-l' }, 'Столешница 38 мм'),
          h('select', {
            onChange: (e: Event) => { topMat = (e.target as HTMLSelectElement).value; },
          }, ...topMats.map((m) => h('option', { value: m.id, selected: m.id === topMat }, m.name))),
        ),
        h('label', { class: 'fld' },
          h('span', { class: 'fld-l' }, 'Цоколь'),
          h('select', {
            onChange: (e: Event) => { plinthColor = (e.target as HTMLSelectElement).value as any; },
          },
            h('option', { value: 'facade', selected: plinthColor === 'facade' }, 'В тон фасада'),
            h('option', { value: 'corpus', selected: plinthColor === 'corpus' }, 'В тон корпуса'),
          ),
        ),
      ),
    );

    // Компоновка
    const layoutWrap = h('div', { class: 'grp' },
      h('h3', null, '5. Компоновка гарнитура'),
      h('div', { class: 'btn-bar' },
        h('button', {
          class: `btn sm ${layoutVariant === 0 ? 'primary' : 'ghost'}`,
          onClick: () => { layoutVariant = 0; renderContent(); },
        }, 'Пенал слева → Мойка → Ящики → Варочная'),
        h('button', {
          class: `btn sm ${layoutVariant === 1 ? 'primary' : 'ghost'}`,
          onClick: () => { layoutVariant = 1; renderContent(); },
        }, 'Мойка → Ящики → Варочная → Пенал справа'),
        h('button', {
          class: `btn sm ${layoutVariant === 2 ? 'primary' : 'ghost'}`,
          onClick: () => { layoutVariant = 2; renderContent(); },
        }, 'Без пенала (линейная рабочая зона)'),
      ),
    );

    container.append(desc, wallLenWrap, tiersWrap, millingWrap, matsWrap, layoutWrap);
  };

  renderContent();
  d.body.append(container);

  const applyKitchen = () => {
    const modules = generateKitchenLayout({
      wallLength,
      tiers,
      facadeMat,
      corpusMat,
      topMat,
      plinthColor,
      millingMix,
      layoutVariant,
    });

    store.commit((p) => {
      p.modules = modules;
    }, 'kitchen-wizard');

    if (modules[0]) store.select(modules[0].id);
    viewer.frame('iso');
    toast(`Кухня сформирована: создано ${modules.length} модулей.`);
    d.close();
  };

  d.foot.append(
    h('button', {
      class: 'btn ghost',
      title: 'Сменить расположение модулей',
      onClick: () => {
        layoutVariant = (layoutVariant + 1) % 3;
        renderContent();
      },
    }, 'Другая планировка'),
    h('button', {
      class: 'btn primary',
      style: 'font-weight:700;',
      onClick: applyKitchen,
    }, 'Собрать кухню (в 3D)'),
  );
}

// ——— план помещения и расстановка стен / окон / дверей ———

export function roomDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('План помещения и стен (2D / 3D)', { wide: true });
  const room: RoomConfig = JSON.parse(JSON.stringify(store.project.room ?? DEFAULT_ROOM));
  let selectedKind: 'room' | 'window' | 'door' = room.windows[0] ? 'window' : 'room';
  let selectedId: string | undefined = room.windows[0]?.id;

  const container = h('div', { style: 'display:flex; flex-direction:column; gap:12px;' });

  const renderContent = () => {
    clear(container);

    const addWindow = () => {
      if (room.windows.length >= 6) {
        toast('Максимум 6 окон в комнате', 'err');
        return;
      }
      const newWin = { id: `w-${Date.now()}`, wall: 'back' as const, x: Math.round(room.w / 2 - 600), w: 1200, h: 1400, lift: 900 };
      room.windows.push(newWin);
      selectedKind = 'window';
      selectedId = newWin.id;
      renderContent();
      viewer.updateRoom(room);
      toast('Окно добавлено. Перетащите его мышкой на любую стену.');
    };

    const addDoor = () => {
      if (room.doors.length >= 6) {
        toast('Максимум 6 дверей в комнате', 'err');
        return;
      }
      const newDoor = { id: `d-${Date.now()}`, wall: 'left' as const, x: Math.max(50, Math.min(room.d - 850, 700)), w: 800, h: 2100, swing: 'in' as const };
      room.doors.push(newDoor);
      selectedKind = 'door';
      selectedId = newDoor.id;
      renderContent();
      viewer.updateRoom(room);
      toast('Дверь добавлена. Перетащите её мышкой на любую стену.');
    };

    // Панель быстрого управления и пресетов
    const topBar = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;' },
      h('div', { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
        h('button', { class: 'btn primary sm', onClick: addWindow }, '+ Окно'),
        h('button', { class: 'btn primary sm', onClick: addDoor }, '+ Дверь'),
        h('span', { class: 'hint', style: 'font-size:12px;' }, 'Тяните проём мышкой на любую стену · Del — удалить · Пробел — открывание'),
      ),
      h('div', { style: 'display:flex; align-items:center; gap:6px;' },
        h('span', { class: 'hint', style: 'font-size:12px;' }, 'Пресеты:'),
        h('button', { class: 'btn sm ghost', onClick: () => { room.w = 4500; room.d = 3000; room.h = 2700; selectedKind = 'room'; renderContent(); viewer.updateRoom(room); } }, '4500 × 3000'),
        h('button', { class: 'btn sm ghost', onClick: () => { room.w = 3600; room.d = 2600; room.h = 2600; selectedKind = 'room'; renderContent(); viewer.updateRoom(room); } }, '3600 × 2600'),
        h('button', { class: 'btn sm ghost', onClick: () => { room.w = 3000; room.d = 2400; room.h = 2500; selectedKind = 'room'; renderContent(); viewer.updateRoom(room); } }, '3000 × 2400'),
      ),
    );

    // SVG 2D архитектурный чертёж
    const planWrap = h('div', { class: 'room-plan-box' });
    planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);

    // Интерактивное перетаскивание на чертеже мышкой (Drag & Drop окон, дверей и угла комнаты с привязкой ко всем стенам)
    let dragInfo: {
      type: 'window' | 'door' | 'corner';
      id?: string;
    } | null = null;

    planWrap.addEventListener('pointerdown', (e: PointerEvent) => {
      const target = (e.target as Element).closest<SVGElement>('.plan-interactive');
      if (!target) {
        selectedKind = 'room';
        selectedId = undefined;
        renderBar();
        planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
        return;
      }

      const type = target.dataset.type as 'window' | 'door' | 'corner';
      const id = target.dataset.id;
      selectedKind = type === 'corner' ? 'room' : type;
      selectedId = id;

      dragInfo = { type, id };

      renderBar();
      planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
      planWrap.setPointerCapture?.(e.pointerId);
    });

    planWrap.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragInfo) return;
      const svg = planWrap.querySelector('svg');
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const pad = 130;
      const WT = room.wallThickness;
      const viewBoxW = room.w + WT * 2 + pad * 2;
      const viewBoxH = room.d + WT * 2 + pad * 2;
      const scaleX = viewBoxW / rect.width;
      const scaleY = viewBoxH / rect.height;

      const svgX = (e.clientX - rect.left) * scaleX;
      const svgY = (e.clientY - rect.top) * scaleY;
      const roomX = svgX - (pad + WT);
      const roomY = svgY - (pad + WT);

      if (dragInfo.type === 'window') {
        const win = room.windows.find((w) => w.id === dragInfo?.id);
        if (win) {
          // Вычисляем расстояние до 3-х стен: задняя (Y=0), левая (X=0), правая (X=W)
          const dBack = Math.abs(roomY);
          const dLeft = Math.abs(roomX);
          const dRight = Math.abs(roomX - room.w);

          let closestWall: 'back' | 'left' | 'right' = 'back';
          let minDist = dBack;
          if (dLeft < minDist) {
            closestWall = 'left';
            minDist = dLeft;
          }
          if (dRight < minDist) {
            closestWall = 'right';
            minDist = dRight;
          }

          win.wall = closestWall;
          if (closestWall === 'back') {
            const raw = roomX - win.w / 2;
            win.x = Math.max(50, Math.min(room.w - win.w - 50, Math.round(raw / 25) * 25));
          } else {
            const raw = roomY - win.w / 2;
            win.x = Math.max(50, Math.min(room.d - win.w - 50, Math.round(raw / 25) * 25));
          }

          planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
          updateBarInputs();
          viewer.updateRoom(room);
        }
      } else if (dragInfo.type === 'door') {
        const door = room.doors.find((d) => d.id === dragInfo?.id);
        if (door) {
          const dBack = Math.abs(roomY);
          const dLeft = Math.abs(roomX);
          const dRight = Math.abs(roomX - room.w);

          let closestWall: 'back' | 'left' | 'right' = 'left';
          let minDist = dLeft;
          if (dBack < minDist) {
            closestWall = 'back';
            minDist = dBack;
          }
          if (dRight < minDist) {
            closestWall = 'right';
            minDist = dRight;
          }

          door.wall = closestWall;
          if (closestWall === 'back') {
            const raw = roomX - door.w / 2;
            door.x = Math.max(50, Math.min(room.w - door.w - 50, Math.round(raw / 25) * 25));
          } else {
            const raw = roomY - door.w / 2;
            door.x = Math.max(50, Math.min(room.d - door.w - 50, Math.round(raw / 25) * 25));
          }

          planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
          updateBarInputs();
          viewer.updateRoom(room);
        }
      } else if (dragInfo.type === 'corner') {
        room.w = Math.max(1800, Math.min(12000, Math.round(roomX / 50) * 50));
        room.d = Math.max(1800, Math.min(12000, Math.round(roomY / 50) * 50));

        // Ограничиваем существующие проёмы под новые размеры стен
        for (const w of room.windows) {
          const max = w.wall === 'back' ? room.w : room.d;
          w.x = Math.max(50, Math.min(max - w.w - 50, w.x));
        }
        for (const d of room.doors) {
          const max = d.wall === 'back' ? room.w : room.d;
          d.x = Math.max(50, Math.min(max - d.w - 50, d.x));
        }

        planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
        updateBarInputs();
        viewer.updateRoom(room);
      }
    });

    const onPointerEnd = () => {
      if (dragInfo) {
        dragInfo = null;
        renderBar();
        viewer.updateRoom(room);
      }
    };
    planWrap.addEventListener('pointerup', onPointerEnd);
    planWrap.addEventListener('pointercancel', onPointerEnd);

    // Нижняя панель свойств выбранного элемента
    const barWrap = h('div', { class: 'room-bar' });

    const renderBar = () => {
      clear(barWrap);

      if (selectedKind === 'window') {
        const win = room.windows.find((w) => w.id === selectedId) ?? room.windows[0];
        if (!win) {
          selectedKind = 'room';
          renderBar();
          return;
        }
        selectedId = win.id;

        const maxSpan = win.wall === 'back' ? room.w : room.d;

        const fields = h('div', { class: 'room-bar-fields' },
          h('span', { style: 'font-weight:700; color:var(--accent);' }, 'Окно:'),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Стена'),
            h('select', {
              id: 'rb-win-wall',
              onChange: (e: Event) => {
                win.wall = (e.target as HTMLSelectElement).value as 'back' | 'left' | 'right';
                const curMax = win.wall === 'back' ? room.w : room.d;
                win.x = Math.max(50, Math.min(curMax - win.w - 50, win.x));
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                renderBar();
                viewer.updateRoom(room);
              },
            },
              h('option', { value: 'back', selected: win.wall === 'back' }, 'Задняя'),
              h('option', { value: 'left', selected: win.wall === 'left' }, 'Левая'),
              h('option', { value: 'right', selected: win.wall === 'right' }, 'Правая'),
            ),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Ширина'),
            h('input', {
              type: 'number', step: 50, min: 400, max: 3000, value: String(win.w), id: 'rb-win-w',
              onInput: (e: Event) => {
                win.w = Number((e.target as HTMLInputElement).value);
                const curMax = win.wall === 'back' ? room.w : room.d;
                win.x = Math.max(50, Math.min(curMax - win.w - 50, win.x));
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Высота'),
            h('input', {
              type: 'number', step: 50, min: 400, max: 2500, value: String(win.h), id: 'rb-win-h',
              onInput: (e: Event) => {
                win.h = Number((e.target as HTMLInputElement).value);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'От пола'),
            h('input', {
              type: 'number', step: 50, min: 0, max: 1500, value: String(win.lift), id: 'rb-win-lift',
              onInput: (e: Event) => {
                win.lift = Number((e.target as HTMLInputElement).value);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'От угла'),
            h('input', {
              type: 'number', step: 25, min: 50, max: maxSpan - win.w - 50, value: String(win.x), id: 'rb-win-x',
              onInput: (e: Event) => {
                win.x = Number((e.target as HTMLInputElement).value);
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
        );

        const delBtn = h('button', {
          type: 'button',
          class: 'btn ghost sm',
          style: 'color:var(--danger);',
          onClick: () => {
            room.windows = room.windows.filter((w) => w.id !== win.id);
            selectedKind = 'room';
            selectedId = undefined;
            renderContent();
            viewer.updateRoom(room);
          },
        }, 'Удалить окно (Del)');

        barWrap.append(fields, delBtn);
      } else if (selectedKind === 'door') {
        const door = room.doors.find((d) => d.id === selectedId) ?? room.doors[0];
        if (!door) {
          selectedKind = 'room';
          renderBar();
          return;
        }
        selectedId = door.id;

        const maxSpan = door.wall === 'back' ? room.w : room.d;

        const fields = h('div', { class: 'room-bar-fields' },
          h('span', { style: 'font-weight:700; color:var(--accent);' }, 'Дверь:'),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Стена'),
            h('select', {
              id: 'rb-door-wall',
              onChange: (e: Event) => {
                door.wall = (e.target as HTMLSelectElement).value as 'back' | 'left' | 'right';
                const curMax = door.wall === 'back' ? room.w : room.d;
                door.x = Math.max(50, Math.min(curMax - door.w - 50, door.x));
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                renderBar();
                viewer.updateRoom(room);
              },
            },
              h('option', { value: 'left', selected: door.wall === 'left' }, 'Левая'),
              h('option', { value: 'back', selected: door.wall === 'back' }, 'Задняя'),
              h('option', { value: 'right', selected: door.wall === 'right' }, 'Правая'),
            ),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Ширина'),
            h('input', {
              type: 'number', step: 50, min: 500, max: 1500, value: String(door.w), id: 'rb-door-w',
              onInput: (e: Event) => {
                door.w = Number((e.target as HTMLInputElement).value);
                const curMax = door.wall === 'back' ? room.w : room.d;
                door.x = Math.max(50, Math.min(curMax - door.w - 50, door.x));
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Высота'),
            h('input', {
              type: 'number', step: 50, min: 1800, max: 2500, value: String(door.h), id: 'rb-door-h',
              onInput: (e: Event) => {
                door.h = Number((e.target as HTMLInputElement).value);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'От угла'),
            h('input', {
              type: 'number', step: 25, min: 50, max: maxSpan - door.w - 50, value: String(door.x), id: 'rb-door-x',
              onInput: (e: Event) => {
                door.x = Number((e.target as HTMLInputElement).value);
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Открывание'),
            h('select', {
              id: 'rb-door-swing',
              onChange: (e: Event) => {
                door.swing = (e.target as HTMLSelectElement).value as any;
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            },
              h('option', { value: 'in', selected: door.swing === 'in' }, 'Внутрь'),
              h('option', { value: 'out', selected: door.swing === 'out' }, 'Наружу'),
            ),
          ),
        );

        const delBtn = h('button', {
          type: 'button',
          class: 'btn ghost sm',
          style: 'color:var(--danger);',
          onClick: () => {
            room.doors = room.doors.filter((d) => d.id !== door.id);
            selectedKind = 'room';
            selectedId = undefined;
            renderContent();
            viewer.updateRoom(room);
          },
        }, 'Удалить дверь (Del)');

        barWrap.append(fields, delBtn);
      } else {
        // Комната целиком
        const fields = h('div', { class: 'room-bar-fields' },
          h('span', { style: 'font-weight:700; color:var(--ink);' }, 'Комната:'),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Длина (X)'),
            h('input', {
              type: 'number', step: 50, min: 1500, max: 12000, value: String(room.w), id: 'rb-room-w',
              onInput: (e: Event) => {
                room.w = Number((e.target as HTMLInputElement).value);
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Глубина (Y)'),
            h('input', {
              type: 'number', step: 50, min: 1500, max: 12000, value: String(room.d), id: 'rb-room-d',
              onInput: (e: Event) => {
                room.d = Number((e.target as HTMLInputElement).value);
                planWrap.innerHTML = renderRoomPlanSvg(room, store.project.modules, selectedId);
                viewer.updateRoom(room);
              },
            }),
          ),
          h('label', { class: 'room-bar-fld' },
            h('span', null, 'Потолок (Z)'),
            h('input', {
              type: 'number', step: 50, min: 2000, max: 4000, value: String(room.h), id: 'rb-room-h',
              onInput: (e: Event) => {
                room.h = Number((e.target as HTMLInputElement).value);
                viewer.updateRoom(room);
              },
            }),
          ),
        );

        const addBtns = h('div', { style: 'display:flex; gap:6px;' },
          h('button', { type: 'button', class: 'btn primary sm', onClick: addWindow }, '+ Добавить окно'),
          h('button', { type: 'button', class: 'btn primary sm', onClick: addDoor }, '+ Добавить дверь'),
        );

        barWrap.append(fields, addBtns);
      }
    };

    const updateBarInputs = () => {
      if (selectedKind === 'window') {
        const win = room.windows.find((w) => w.id === selectedId);
        if (win) {
          const el = document.getElementById('rb-win-x') as HTMLInputElement | null;
          if (el) {
            el.value = String(win.x);
            el.max = String((win.wall === 'back' ? room.w : room.d) - win.w - 50);
          }
          const elWall = document.getElementById('rb-win-wall') as HTMLSelectElement | null;
          if (elWall && elWall.value !== win.wall) elWall.value = win.wall;
        }
      } else if (selectedKind === 'door') {
        const door = room.doors.find((d) => d.id === selectedId);
        if (door) {
          const el = document.getElementById('rb-door-x') as HTMLInputElement | null;
          if (el) {
            el.value = String(door.x);
            el.max = String((door.wall === 'back' ? room.w : room.d) - door.w - 50);
          }
          const elWall = document.getElementById('rb-door-wall') as HTMLSelectElement | null;
          if (elWall && elWall.value !== door.wall) elWall.value = door.wall;
        }
      } else if (selectedKind === 'room') {
        const rw = document.getElementById('rb-room-w') as HTMLInputElement | null;
        if (rw) rw.value = String(room.w);
        const rd = document.getElementById('rb-room-d') as HTMLInputElement | null;
        if (rd) rd.value = String(room.d);
      }
    };

    renderBar();
    container.append(topBar, planWrap, barWrap);
  };

  // Горячие клавиши для плана: Del - удаление, Пробел - сменить открывание двери, стрелки - смещение
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedKind === 'window' && selectedId) {
        room.windows = room.windows.filter((w) => w.id !== selectedId);
        selectedKind = 'room';
        selectedId = undefined;
        renderContent();
        viewer.updateRoom(room);
        toast('Окно удалено');
      } else if (selectedKind === 'door' && selectedId) {
        room.doors = room.doors.filter((d) => d.id !== selectedId);
        selectedKind = 'room';
        selectedId = undefined;
        renderContent();
        viewer.updateRoom(room);
        toast('Дверь удалена');
      }
    } else if (e.key === ' ' || e.code === 'Space') {
      if (selectedKind === 'door' && selectedId) {
        e.preventDefault();
        const door = room.doors.find((d) => d.id === selectedId);
        if (door) {
          door.swing = door.swing === 'in' ? 'out' : 'in';
          renderContent();
          viewer.updateRoom(room);
        }
      }
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -25 : 25;
      if (selectedKind === 'window' && selectedId) {
        const win = room.windows.find((w) => w.id === selectedId);
        if (win) {
          e.preventDefault();
          const max = win.wall === 'back' ? room.w : room.d;
          win.x = Math.max(50, Math.min(max - win.w - 50, win.x + delta));
          renderContent();
          viewer.updateRoom(room);
        }
      } else if (selectedKind === 'door' && selectedId) {
        const door = room.doors.find((d) => d.id === selectedId);
        if (door) {
          e.preventDefault();
          const max = door.wall === 'back' ? room.w : room.d;
          door.x = Math.max(50, Math.min(max - door.w - 50, door.x + delta));
          renderContent();
          viewer.updateRoom(room);
        }
      }
    }
  };
  d.el.addEventListener('keydown', onKeyDown);

  renderContent();
  d.body.append(container);

  d.foot.append(
    h('button', {
      class: 'btn ghost',
      onClick: () => {
        // Восстанавливаем исходную 3D-комнату при отмене
        viewer.updateRoom(store.project.room ?? DEFAULT_ROOM);
        d.close();
      },
    }, 'Отмена'),
    h('button', {
      class: 'btn primary',
      style: 'font-weight:700;',
      onClick: () => {
        store.commit((p) => {
          p.room = room;
        }, 'room-update');
        viewer.updateRoom(room);
        toast(`Комната ${room.w}×${room.d}×${room.h} мм сохранена и построена в 3D.`);
        d.close();
      },
    }, 'Применить к 3D-комнате'),
  );
}

