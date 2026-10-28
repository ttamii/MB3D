import '@fontsource-variable/inter';
import '../styles/app.css';
import { estimate, type Estimate } from '../core/estimate';
import { DEFAULT_ROOM } from '../core/room';
import { decodeShare, saveToLibrary } from '../core/storage';
import { money, rafThrottle } from '../core/util';
import { Viewer, type ViewName } from '../three/viewer';
import { aiConstructorDialog, arDialog, blueprintDialog, cutDialog, estimateDialog, helpDialog, kitchenWizardDialog, projectsDialog, renderDialog, roomDialog, settingsDialog, shareDialog, toast } from '../ui/dialogs';
import { clear, h, icon } from '../ui/dom';
import { createFloatingHud } from '../ui/floatingHud';
import { renderModules, renderProps } from '../ui/panels';
import { showModuleContextMenu } from '../ui/contextMenu';
import { parseFurniturePrompt } from '../core/aiConstructor';
import { Store } from './store';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

async function boot(): Promise<void> {
  const store = new Store();
  const app = $('app');
  let company: { name: string; phone: string } | null = null;

  const urlParams = new URLSearchParams(location.search);
  const aiQuery = urlParams.get('ai');
  const isNew = urlParams.get('new') === '1' || urlParams.get('clear') === '1';

  const token = location.hash.match(/^#v=([\w-]+)$/);
  if (token) {
    const r = await decodeShare(token[1], store.settings);
    if (r) {
      store.readOnly = true;
      store.project = r.project;
      store.selectedId = null;
      company = r.company;
      app.classList.add('share');
      document.title = `${r.project.name} — ${r.company.name || 'Mebel3D'}`;
    }
  } else if (aiQuery) {
    const res = parseFurniturePrompt(aiQuery);
    const newMods = res.modules?.length ? res.modules : [res.module];
    store.commit((p) => {
      p.modules = newMods;
      p.name = res.title.replace('AI-Генерация: ', '');
    }, 'ai-init');
    store.select(newMods[0]?.id ?? null);
    setTimeout(() => toast(`AI-Генерация: ${newMods.length} мод. создано`), 400);
  } else if (isNew) {
    store.commit((p) => {
      p.modules = [];
      p.name = 'Новый проект';
    }, 'new-init');
    store.select(null);
  }

  const viewport = $('viewport');
  let viewer: Viewer;
  try {
    viewer = new Viewer(viewport, () => store.settings.materials);
  } catch {
    viewport.append(h('p', { class: 'fatal' }, 'Не удалось запустить 3D: браузер не поддерживает WebGL. Обновите браузер или откройте на другом устройстве.'));
    return;
  }
  viewer.onPick = (id) => store.select(id);
  viewer.onModuleDrag = (_id, x) => {
    hud.textContent = `Позиция модуля: X = ${x} мм (пристыкован)`;
  };
  viewer.onModuleDragEnd = (id, newX) => {
    store.commit((p) => {
      const m = p.modules.find((x) => x.id === id);
      if (m) m.x = newX;
    }, 'drag-3d');
  };
  viewer.onContextMenu = (moduleId, x, y) => {
    if (moduleId && !store.readOnly) {
      showModuleContextMenu(moduleId, x, y, store, viewer);
    }
  };

  let est: Estimate = estimate(store.project.modules, store.settings);
  let lastIds = '';
  let lastProjectId = '';

  const priceEl = $('price');
  const nameEl = $<HTMLInputElement>('proj-name');
  const hud = $('hud');
  const left = $('left');
  const right = $('right');
  const stage = $('stage');

  const floatingHud = createFloatingHud(stage, store, viewer);

  const undoBtn = h('button', { type: 'button', class: 'ib tb', title: 'Отменить (Ctrl+Z)', 'aria-label': 'Отменить', onClick: () => store.undo() }, icon('undo'));
  const redoBtn = h('button', { type: 'button', class: 'ib tb', title: 'Повторить (Ctrl+Y)', 'aria-label': 'Повторить', onClick: () => store.redo() }, icon('redo'));
  const act = (label: string, ic: string, on: () => void, cls = '') =>
    h('button', { type: 'button', class: 'btn ghost tool ' + cls, title: label, onClick: on }, icon(ic, 17), h('span', null, label));

  const newProjBtn = h('button', {
    type: 'button',
    class: 'btn ghost tool new-proj-btn',
    title: 'Начать новый чистый проект',
    onClick: () => {
      if (!store.project.modules.length || confirm('Начать новый проект? Несохраненные изменения текущего проекта будут очищены.')) {
        store.newProject();
        toast('Создан новый чистый проект');
      }
    },
  }, icon('plus', 16), h('span', null, 'Новый'));

  const actions = $('actions');
  let topXrayBtn: HTMLElement | null = null;

  // панель видов
  const views: [ViewName, string][] = [['iso', '3D'], ['front', 'Спереди'], ['top', 'Сверху'], ['side', 'Сбоку']];
  const vt = $('viewtools');
  const openBtn = h('button', { type: 'button', class: 'vt-b open', 'aria-pressed': 'false', onClick: () => {
    viewer.setOpen(!viewer.isOpen());
    updateOpenBtn();
  } }, icon('door', 16), h('span', null, 'Открыть двери'));

  const updateOpenBtn = () => {
    const open = viewer.isOpen();
    openBtn.setAttribute('aria-pressed', String(open));
    openBtn.classList.toggle('on', open);
    const span = openBtn.querySelector('span');
    if (span) span.textContent = open ? 'Закрыть двери' : 'Открыть двери';
  };
  viewer.onAnimChange = updateOpenBtn;

  const dimBtn = h('button', {
    type: 'button',
    class: 'vt-b dim on',
    'aria-pressed': 'true',
    title: 'Показать габаритные размеры и привязки модулей в 3D',
    onClick: () => {
      const active = viewer.toggleDimensions();
      dimBtn.setAttribute('aria-pressed', String(active));
      dimBtn.classList.toggle('on', active);
    },
  }, icon('blueprint', 16), h('span', null, 'Размеры'));

  const xrayBtn = h('button', {
    type: 'button',
    class: 'vt-b xray',
    'aria-pressed': 'false',
    title: 'Рентген (X-Ray): показать все шурупы, конфирматы и присадку сквозь прозрачные панели (горячая клавиша X)',
    onClick: () => {
      const on = viewer.toggleXray();
      xrayBtn.setAttribute('aria-pressed', String(on));
      xrayBtn.classList.toggle('on', on);
      if (topXrayBtn) {
        topXrayBtn.setAttribute('aria-pressed', String(on));
        topXrayBtn.classList.toggle('on', on);
      }
      toast(on ? 'Рентген: шурупы и присадка включены' : 'Рентген: выключен');
    },
  }, icon('layers', 16), h('span', null, 'Рентген (шурупы)'));

  topXrayBtn = act('Рентген', 'layers', () => xrayBtn.click(), 'xray-tool-btn');

  if (!store.readOnly) {
    actions.append(
      newProjBtn,
      undoBtn, redoBtn, h('span', { class: 'sep' }),
      act('Стены', 'grid', () => {
        const mode = viewer.toggleWallMode();
        toast(mode === 'solid' ? 'Стены: 3D-модель (срезы)' : mode === 'ghost' ? 'Стены: Прозрачные (Ghost)' : 'Стены: Скрыты');
      }),
      act('План', 'layers', () => roomDialog(store, viewer)),
      topXrayBtn,
      h('span', { class: 'sep' }),
      act('AI Конструктор', 'wand', () => aiConstructorDialog(store, viewer), 'accent keep-label'),
      act('Мастер кухни', 'wand', () => kitchenWizardDialog(store, viewer), 'keep-label'),
      h('span', { class: 'sep' }),
      act('Смета', 'calc', () => estimateDialog(store, est, viewer), 'keep-label'),
      act('Раскрой', 'list', () => cutDialog(store, est, viewer), 'keep-label'),
      act('Чертёж', 'blueprint', () => blueprintDialog(store, viewer), 'keep-label'),
      h('span', { class: 'sep' }),
      act('Рендер', 'camera', () => renderDialog(store, viewer)),
      act('AR', 'cube', () => arDialog(store, viewer)),
      act('Проекты', 'folder', () => projectsDialog(store, () => {})),
      act('Поделиться', 'link', () => shareDialog(store)),
      h('span', { class: 'sep' }),
      h('button', { type: 'button', class: 'ib tb', title: 'Настройки цен', 'aria-label': 'Настройки', onClick: () => settingsDialog(store) }, icon('sliders')),
      h('button', { type: 'button', class: 'ib tb', title: 'Справка', 'aria-label': 'Справка', onClick: () => helpDialog() }, icon('info')));
  } else {
    actions.append(act('Посмотреть в AR', 'cube', () => arDialog(store, viewer), 'accent'));
    if (company?.phone) {
      const tel = company.phone.replace(/[^\d+]/g, '');
      actions.append(h('a', { class: 'btn primary tool', href: `tel:${tel}` }, `Позвонить: ${company.phone}`));
    }
    nameEl.readOnly = true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'x' || e.key === 'X' || e.key === 'ч' || e.key === 'Ч') {
      xrayBtn.click();
    }
  });

  vt.append(...views.map(([v, t]) => h('button', { type: 'button', class: 'vt-b', onClick: () => viewer.frame(v) }, t)), dimBtn, openBtn, xrayBtn);

  const refreshChrome = () => {
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    priceEl.textContent = money(est.total);
    floatingHud.update();
    if (document.activeElement !== nameEl) nameEl.value = store.project.name;
    const m = store.selected;
    const mods = store.project.modules;
    const roomW = store.project.room?.w ?? DEFAULT_ROOM.w;
    let runLen = 0;
    if (mods.length > 0) {
      const minX = Math.min(...mods.map((x) => x.x));
      const maxX = Math.max(...mods.map((x) => x.x + x.w));
      runLen = maxX - minX;
    }
    const overflow = runLen > roomW;
    const overWarn = overflow ? ` · [ВНИМАНИЕ: ряд (${runLen} мм) шире стены (${roomW} мм)!]` : '';
    hud.textContent = m
      ? `${m.name} · ${m.w}×${m.h}×${m.d} мм (X: ${m.x})${overWarn}`
      : `${mods.length} мод. · Ряд кухни: ${runLen} мм / комната: ${roomW} мм${overWarn}`;
  };

  const renderPanels = () => {
    if (store.readOnly) return;
    renderModules(left, store, est);
    renderProps(right, store);
  };

  const full = rafThrottle(() => {
    est = estimate(store.project.modules, store.settings);
    viewer.update(store.project.modules);
    viewer.updateRoom(store.project.room ?? DEFAULT_ROOM);
    const ids = store.project.modules.map((m) => m.id).join(',');
    const grew = store.project.modules.length > lastIds.split(',').filter(Boolean).length;
    if (store.project.id !== lastProjectId || (grew && ids !== lastIds)) viewer.frame('iso', lastProjectId !== '');
    lastIds = ids;
    lastProjectId = store.project.id;
    viewer.setSelected(store.selectedId);
    renderPanels();
    refreshChrome();
  });

  store.subscribe((c) => {
    if (c === 'select') {
      viewer.setSelected(store.selectedId);
      renderPanels();
      refreshChrome();
      if (store.selectedId && window.matchMedia('(max-width: 900px)').matches === false) return;
    } else full();
  });

  nameEl.addEventListener('input', () => store.commit((p) => { p.name = nameEl.value.slice(0, 80); }, 'pname'));
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameEl.blur(); });

  store.onStorageError = (failed) => { if (failed) toast('Не удалось сохранить: нет места в браузере. Экспортируйте проект в файл.', 'err'); };

  // горячие клавиши
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (saveToLibrary(store.project, store.settings)) toast('Проект сохранён'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId && !store.readOnly) { e.preventDefault(); store.remove(store.selectedId); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && store.selectedId && !store.readOnly) {
      e.preventDefault();
      const step = e.shiftKey ? 100 : 10;
      const dx = e.key === 'ArrowLeft' ? -step : step;
      store.commit((p) => {
        const sel = p.modules.find((x) => x.id === store.selectedId);
        if (sel) sel.x = Math.round(sel.x + dx);
      }, 'move-key');
    }
  });

  // мобильные вкладки
  const tabs = $('tabbar');
  const tabDefs: [string, string][] = [['left', 'Модули'], ['3d', '3D'], ['right', 'Параметры']];
  clear(tabs);
  tabs.append(...tabDefs.map(([k, t]) => h('button', { type: 'button', class: 'tab' + (k === '3d' ? ' on' : ''), 'data-tab': k, onClick: () => {
    app.dataset.tab = k;
    tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === k));
    requestAnimationFrame(() => viewer.invalidate());
  } }, t)));
  app.dataset.tab = '3d';
  if (store.readOnly) tabs.hidden = true;

  full();
}

boot();
