import { estimate, type Estimate, cutListCsv } from '../core/estimate';
import { buildModule } from '../core/geometry';
import { computeModuleDrilling } from '../core/drilling';
import { renderAssemblyBlueprintSvg, renderFacadeDrillingSvg, renderSidePanelDrillingSvg } from '../core/blueprint';
import { planKitchen } from '../core/kitchenWizard';
import { parseFurniturePrompt } from '../core/aiConstructor';
import { computeNesting, renderSheetSvg, DEFAULT_SHEET_FORMATS } from '../core/nesting';
import { DEFAULT_ROOM, renderRoomPlanSvg, type RoomConfig } from '../core/room';
import type { ProjectStatus, Settings } from '../core/types';
import {
  createAccount, deleteAccount, getCloudConfig, getCurrentUser, hasActiveSubscription,
  isAccessGateEnabled, isCloudConfigured, loadAccounts, loginWithCredentials,
  logoutCurrentUser, pullProjectsFromCloud, pushProjectToCloud, registerAccount,
  setAccessGateEnabled, setAccountSubscription, setCloudConfig, signInWithGoogleOAuth,
  syncAccountFromCloud, toggleAccountActive, updateAccountPassword, type SubscriptionPlan,
} from '../core/auth';
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
  const d = openDialog('Смета и Коммерческое предложение (КП)', { wide: true });
  const cur = '₸';
  let viewMode: 'client' | 'workshop' = 'client';
  const container = h('div', { style: 'display:flex; flex-direction:column; gap:12px;' });

  const row = (name: string, qty: string, cost: number, cls = '') =>
    h('tr', { class: cls }, h('td', null, name), h('td', { class: 'r' }, qty), h('td', { class: 'r' }, money(cost, cur)));

  const buildWhatsappText = (): string => {
    const p = store.project;
    const lines: string[] = [
      `📐 *Коммерческое предложение: ${p.name}*`,
      p.clientName ? `👤 Клиент: ${p.clientName}` : '',
      '',
      '*Состав изделия (габариты Ш×В×Г):*',
      ...p.modules.map((m, idx) => `${idx + 1}. ${m.name} (${m.w}×${m.h}×${m.d} мм) — ${money(est.perModule[m.id] ?? 0, cur)}`),
      '',
      `✅ В стоимость включено: плитные материалы EGGER/AGT, кромление ПВХ, фурнитура с доводчиками, изготовление в цехе и сборка.`,
      `💰 *ИТОГО ПОД КЛЮЧ: ${money(est.total, cur)}*`,
      store.settings.company.name ? `\nС уважением, ${store.settings.company.name}${store.settings.company.phone ? ' (' + store.settings.company.phone + ')' : ''}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const printClientContract = () => {
    const w = window.open('', '_blank');
    if (!w) {
      toast('Разрешите всплывающие окна в браузере для печати Договора', 'err');
      return;
    }
    const p = store.project;
    const comp = store.settings.company;
    const matMap = new Map(store.settings.materials.map((m) => [m.id, m.name]));
    const firstMod = p.modules[0];
    const corpusName = firstMod ? (matMap.get(firstMod.matCorpus) ?? 'ЛДСП 16 мм') : 'ЛДСП 16 мм';
    const facadeName = firstMod ? (matMap.get(firstMod.matFacade) ?? 'МДФ 18 мм') : 'МДФ 18 мм';
    const topName = firstMod ? (matMap.get(firstMod.matTop) ?? 'Столешница 38 мм') : 'Столешница 38 мм';
    const advance70 = Math.round(est.total * 0.7);
    const balance30 = Math.max(0, est.total - advance70);
    const today = new Date().toLocaleDateString('ru-RU');
    const contractNum = `${new Date().getFullYear()}-${String(p.modules.length).padStart(2, '0')}`;

    const rowsHtml = p.modules.map((m, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td><b>${m.name}</b></td>
        <td style="text-align:center;">${m.w} × ${m.h} × ${m.d}</td>
        <td style="text-align:right;">${money(est.perModule[m.id] ?? 0, cur)}</td>
      </tr>
    `).join('');

    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
      <title>Договор бытового подряда № ${contractNum} — ${p.name}</title>
      <style>
        body { font-family: "Times New Roman", Times, serif; margin: 14mm 16mm; color: #111; font-size: 12pt; line-height: 1.4; }
        h1 { font-size: 14pt; text-align: center; margin: 0 0 4px 0; text-transform: uppercase; }
        .sub { text-align: center; font-size: 11pt; margin-bottom: 14px; color: #333; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 14px; font-weight: bold; }
        h3 { font-size: 12pt; margin: 12px 0 4px 0; text-transform: uppercase; }
        p { margin: 4px 0; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 12px 0; font-family: Arial, sans-serif; font-size: 10pt; }
        th, td { border: 1px solid #222; padding: 5px 8px; }
        th { background: #f3f4f6; }
        .summary-box { border: 1.5px solid #111; padding: 8px 12px; margin: 10px 0; background: #fafafa; font-family: Arial, sans-serif; font-size: 10.5pt; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; page-break-inside: avoid; }
        .sig-block { border-top: 1px solid #333; padding-top: 8px; font-size: 11pt; }
      </style></head><body>
      <h1>Договор бытового подряда № ${contractNum}</h1>
      <div class="sub">на изготовление и монтаж корпусной мебели по индивидуальному проекту</div>
      <div class="meta">
        <span>Республика Казахстан</span>
        <span>Дата: ${today} г.</span>
      </div>
      <p><b>${comp.name || 'ИП / ТОО «Мебельное производство»'}</b>${comp.phone ? ' (тел.: ' + comp.phone + ')' : ''}, именуемое в дальнейшем <b>«Исполнитель»</b>, с одной стороны, и <b>${p.clientName || '__________________________________________'}</b>${p.clientPhone ? ' (тел.: ' + p.clientPhone + ')' : ''}, именуемый(-ая) в дальнейшем <b>«Заказчик»</b>, с другой стороны, заключили настоящий Договор о нижеследующем:</p>

      <h3>1. Предмет договора и спецификация изделия</h3>
      <p>1.1. Исполнитель обязуется изготовить, доставить и установить комплект корпусной мебели по проекту <b>«${p.name}»</b>${p.clientAddress ? ' по адресу монтажа: <b>' + p.clientAddress + '</b>' : ''}, а Заказчик обязуется принять и оплатить изделие.</p>
      <p>1.2. Материалы проекта: корпус — <b>${corpusName}</b>, фасады — <b>${facadeName}</b>, столешница / крышка — <b>${topName}</b>, кромка ПВХ в цвет.</p>
      <table>
        <thead>
          <tr><th style="width:36px;">№</th><th>Наименование модуля / секции</th><th style="width:140px;">Габариты (Ш×В×Г), мм</th><th style="width:120px;">Стоимость</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <h3>2. Стоимость договора и порядок расчётов</h3>
      <div class="summary-box">
        <div><b>Общая стоимость заказа под ключ:</b> ${money(est.total, cur)}</div>
        <div><b>Предоплата при подписании Договора (70%):</b> ${money(advance70, cur)}</div>
        <div><b>Окончательный расчёт после монтажа и подписания Акта приёмки (30%):</b> ${money(balance30, cur)}</div>
      </div>

      <h3>3. Сроки изготовления и гарантийные обязательства</h3>
      <p>3.1. Срок изготовления мебели составляет <b>от 14 до 25 рабочих дней</b> с момента внесения предоплаты 70% и утверждения итогового эскиза.</p>
      <p>3.2. Гарантийный срок на изготовленную мебель и монтаж составляет <b>12 (двенадцать) месяцев</b> со дня установки при соблюдении правил эксплуатации.</p>

      <div class="sigs">
        <div class="sig-block">
          <b>ИСПОЛНИТЕЛЬ:</b><br>
          ${comp.name || 'Производственный цех'}<br>
          ${comp.phone ? 'Тел.: ' + comp.phone + '<br>' : ''}
          <br>Подпись / М.П.: _______________________
        </div>
        <div class="sig-block">
          <b>ЗАКАЗЧИК:</b><br>
          ФИО: ${p.clientName || '_______________________________'}<br>
          Тел.: ${p.clientPhone || '_______________________________'}<br>
          Адрес: ${p.clientAddress || '_____________________________'}<br>
          <br>Подпись: _____________________________
        </div>
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  };

  const renderEst = () => {
    clear(container);
    const mods = store.project.modules;
    const netCost = Math.max(0, est.total - est.markup);

    const modeTabs = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;' },
      h('div', { class: 'seg' },
        h('button', {
          type: 'button',
          class: `seg-b ${viewMode === 'client' ? 'on' : ''}`,
          onClick: () => { viewMode = 'client'; renderEst(); },
        }, '1. КП для клиента (без наценки цеха)'),
        h('button', {
          type: 'button',
          class: `seg-b ${viewMode === 'workshop' ? 'on' : ''}`,
          onClick: () => { viewMode = 'workshop'; renderEst(); },
        }, '2. Цеховая смета (себестоимость и прибыль)'),
      ),
      btn('Скопировать КП для WhatsApp', 'ghost sm', () => {
        void navigator.clipboard.writeText(buildWhatsappText());
        toast('Текст КП скопирован — вставьте в WhatsApp или Telegram клиенту');
      }, 'copy'),
    );

    const t1 = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, 'Модуль / Изделие'), h('th', { class: 'r' }, 'Габариты (Ш×В×Г), мм'), h('th', { class: 'r' }, 'Стоимость'))),
      h('tbody', null, ...mods.map((m, idx) => h('tr', null,
        h('td', null, String(idx + 1)),
        h('td', { style: 'font-weight:600;' }, m.name),
        h('td', { class: 'r' }, `${m.w} × ${m.h} × ${m.d}`),
        h('td', { class: 'r', style: 'font-weight:600;' }, money(est.perModule[m.id] ?? 0, cur)),
      ))),
    );

    container.append(modeTabs);

    if (viewMode === 'client') {
      const kpiCards = h('div', {
        style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; padding:12px 14px; background:var(--panel-2); border:1px solid var(--line); border-radius:10px;',
      },
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Итоговая цена для клиента'),
          h('div', { style: 'font-size:20px; font-weight:800; color:var(--accent);' }, money(est.total, cur)),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Модулей в проекте'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--ink);' }, `${mods.length} ед.`),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Площадь деталей'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--ink);' }, `${fmtNum(est.area)} м²`),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Комплектация'),
          h('div', { style: 'font-size:13px; font-weight:600; color:var(--ok);' }, 'Под ключ (с фурнитурой и сборкой)'),
        ),
      );

      container.append(
        kpiCards,
        h('p', { class: 'hint' }, 'В этом режиме скрыты внутренние отходы, раскрой и маржа цеха — экран можно показывать прямо заказчику.'),
        h('div', { class: 'scroll-x' }, t1),
      );
    } else {
      const profitCards = h('div', {
        style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; padding:12px 14px; background:var(--panel-2); border:1px solid var(--line); border-radius:10px;',
      },
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Цена продажи'),
          h('div', { style: 'font-size:18px; font-weight:800; color:var(--ink);' }, money(est.total, cur)),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Себестоимость (плиты + работы)'),
          h('div', { style: 'font-size:18px; font-weight:700; color:var(--ink-2);' }, money(netCost, cur)),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, `Чистая прибыль цеха (${store.settings.labor.markup}%)`),
          h('div', { style: 'font-size:18px; font-weight:800; color:#16a34a;' }, `+ ${money(est.markup, cur)}`),
        ),
      );

      const t2 = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Статья расходов'), h('th', { class: 'r' }, 'Кол-во'), h('th', { class: 'r' }, 'Сумма'))),
        h('tbody', null,
          h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, `Материалы (с учётом отходов ${store.settings.waste}%)`)),
          ...est.materials.map((l) => row(l.name, `${fmtNum(l.qty)} ${l.unit}`, l.cost)),
          row(est.edge.name, `${fmtNum(est.edge.qty)} ${est.edge.unit}`, est.edge.cost),
          h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, 'Фурнитура и комплектующие')),
          ...est.hardware.map((l) => row(l.name, `${fmtNum(l.qty)} ${l.unit}`, l.cost)),
          h('tr', { class: 'grp-r' }, h('td', { colspan: '3' }, 'Производственные работы и логистика')),
          ...est.labor.map((l) => row(l.name, '', l.cost)),
          row(`Маржа / наценка цеха (${store.settings.labor.markup}%)`, '', est.markup),
        ));

      container.append(
        profitCards,
        h('p', { class: 'hint' }, `Чистая площадь деталей: ${fmtNum(est.area)} м². Закупочные цены и коэффициенты настраиваются в «Настройках».`),
        h('div', { class: 'scroll-x' }, t2),
      );
    }
  };

  renderEst();
  d.body.append(container);

  d.foot.append(
    btn('Печать КП для клиента (PDF)', 'primary', () => { d.close(); printDoc('kp', store, est, viewer); }, 'printer'),
    btn('Договор с клиентом (РК, PDF)', 'ghost', printClientContract, 'file'),
    btn('Внутренняя смета цеха (PDF)', 'ghost', () => { d.close(); printDoc('estimate', store, est, viewer); }, 'list'),
  );
}

// ——— деталировка ———

export function cutDialog(store: Store, est: Estimate, viewer: Viewer): void {
  const d = openDialog('Деталировка, карты раскроя и бирки для цеха', { wide: true });
  const rows = [...est.cut].sort((a, b) => a.matName.localeCompare(b.matName, 'ru') || b.l - a.l);
  const pieces = rows.reduce((s, r) => s + r.qty, 0);

  let activeTab: 'cut' | 'nesting' | 'labels' = 'cut';
  let sheetFormatIndex = 0;
  let activeSheetIndex = 0;

  const container = h('div', { class: 'cut-container', style: 'display:flex; flex-direction:column; gap:12px;' });

  const printLabelsWindow = () => {
    const w = window.open('', '_blank');
    if (!w) {
      toast('Разрешите всплывающие окна в браузере для печати бирок', 'err');
      return;
    }
    const cardsHtml: string[] = [];
    let stickerNum = 1;
    rows.forEach((r) => {
      for (let q = 1; q <= r.qty; q++) {
        cardsHtml.push(`
          <div class="lbl">
            <div class="lbl-top">
              <b>ADAL Constructor · #${stickerNum++}</b>
              <span>${q}/${r.qty} шт</span>
            </div>
            <div class="lbl-mod">${r.moduleName}</div>
            <div class="lbl-part">${r.name}</div>
            <div class="lbl-dims">${r.l} × ${r.w} × ${r.t} мм</div>
            <div class="lbl-mat">${r.matName}</div>
            <div class="lbl-edge">Кромка ПВХ: ${r.edgeMm > 0 ? Math.round(r.edgeMm) + ' мм' : 'без кромки'}</div>
          </div>
        `);
      }
    });
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Бирки на детали — ${store.project.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 10mm; color: #111; }
        h2 { margin: 0 0 10px 0; font-size: 16px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
        .lbl { border: 1.5px solid #222; border-radius: 4px; padding: 3.5mm; page-break-inside: avoid; font-size: 11px; }
        .lbl-top { display: flex; justify-content: space-between; font-size: 10px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px; }
        .lbl-mod { font-weight: 700; font-size: 11px; color: #1e3a8a; }
        .lbl-part { font-weight: 700; font-size: 13px; margin: 2px 0; }
        .lbl-dims { font-size: 15px; font-weight: 800; background: #f3f4f6; padding: 2px 6px; border-radius: 3px; display: inline-block; margin: 3px 0; }
        .lbl-mat { font-size: 10px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lbl-edge { font-size: 10px; font-weight: 700; margin-top: 2px; }
      </style></head><body>
      <h2>Бирки маркировки деталей — Заказ: ${store.project.name}${store.project.clientName ? ' (' + store.project.clientName + ')' : ''}</h2>
      <div class="grid">${cardsHtml.join('')}</div>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  };

  const renderContent = () => {
    clear(container);

    const tabsBar = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:6px;' },
      h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
        h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'cut' ? ' on' : ''),
          onClick: () => { activeTab = 'cut'; renderContent(); },
        }, '1. Спецификация деталей'),
        h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'nesting' ? ' on' : ''),
          onClick: () => { activeTab = 'nesting'; renderContent(); },
        }, '2. Карта раскроя плит'),
        h('button', {
          type: 'button',
          class: 'seg-b' + (activeTab === 'labels' ? ' on' : ''),
          onClick: () => { activeTab = 'labels'; renderContent(); },
        }, `3. Бирки (стикеры) для цеха (${pieces} шт)`),
      ),
      activeTab === 'nesting' ? h('div', { style: 'display:flex; align-items:center; gap:8px;' },
        h('span', { style: 'font-size:12.5px; font-weight:600; color:var(--muted);' }, 'Формат плиты:'),
        h('select', {
          style: 'padding:5px 10px; border-radius:6px; border:1px solid var(--line); background:var(--card); font-size:12.5px; font-weight:600; color:var(--text);',
          onChange: (e: Event) => {
            sheetFormatIndex = Number((e.target as HTMLSelectElement).value);
            activeSheetIndex = 0;
            renderContent();
          },
        }, ...DEFAULT_SHEET_FORMATS.map((fmt, idx) =>
          h('option', { value: String(idx), selected: idx === sheetFormatIndex }, fmt.name)
        )),
      ) : activeTab === 'labels' ? btn('Печать листа бирок (А4 / стикеры)', 'primary sm', printLabelsWindow, 'printer') : null,
    );

    container.append(tabsBar);

    if (activeTab === 'cut') {
      const mods = store.project.modules;
      const wideShelfMods = mods.filter((m) => (m.w / Math.max(1, m.sections.length)) > 950 && m.sections.some((s) => s.shelves > 0) && !m.name.includes('Фальш'));
      const hasContinuousPlinth = rows.some((r) => r.name.includes('Цоколь цельный'));
      const hasContinuousTop = rows.some((r) => r.name.includes('Столешница цельная'));
      const hasTopTrim = rows.some((r) => r.name.includes('Верхняя планка'));
      const hasWallFillers = mods.some((m) => m.w <= 80 && m.name.toLowerCase().includes('фальш'));
      const maxPartLen = rows.reduce((mx, r) => Math.max(mx, r.l), 0);

      const qcItems: { ok: boolean; text: string }[] = [
        {
          ok: wideShelfMods.length === 0,
          text: wideShelfMods.length === 0
            ? 'Прогиб полок: все секции ≤ 950 мм (безопасно для ЛДСП 16 мм)'
            : `Внимание: у ${wideShelfMods.length} мод. пролёт полки > 950 мм — рекомендуется вертикальная перегородка или 22 мм`,
        },
        {
          ok: maxPartLen <= 2770 || rows.some((r) => r.name.includes('Столешница') && r.l <= 3050),
          text: `Габариты раскроя: макс. деталь ${maxPartLen} мм — помещается в стандартный лист`,
        },
      ];
      if (hasContinuousPlinth || hasContinuousTop) {
        qcItems.push({
          ok: true,
          text: `Цельные узлы: ${[hasContinuousPlinth ? 'единый цоколь на клипсах' : '', hasContinuousTop ? 'цельная столешница' : '', hasTopTrim ? 'верхний карниз' : ''].filter(Boolean).join(', ')}`,
        });
      }
      if (hasWallFillers) {
        qcItems.push({
          ok: true,
          text: 'Защита от битья фасадов: предусмотрены пристенные доборы (фальш-планки)',
        });
      }

      const qcBanner = h('div', {
        style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:8px; padding:10px 12px; background:var(--panel-2); border:1px solid var(--line); border-radius:8px;',
      }, ...qcItems.map((it) =>
        h('div', { style: 'display:flex; align-items:flex-start; gap:6px; font-size:12px; line-height:1.35;' },
          h('span', { style: `font-weight:800; color:${it.ok ? 'var(--ok)' : '#d97706'};` }, it.ok ? '✓' : '⚠'),
          h('span', { style: 'color:var(--ink-2); font-weight:500;' }, it.text),
        )
      ));

      container.append(
        qcBanner,
        h('p', { class: 'hint' }, `${rows.length} позиций · ${pieces} деталей. Размеры в мм: длина × ширина × толщина. Для ЧПУ/Excel скачайте CSV-таблицу ниже.`),
        h('div', { class: 'scroll-x' },
          h('table', { class: 'tbl dense' },
            h('thead', null, h('tr', null, ...['№', 'Модуль', 'Деталь', 'Длина', 'Ширина', 'Т', 'Шт', 'Материал', 'Кромка, мм'].map((t, i) => h('th', { class: i >= 3 && i !== 7 ? 'r' : '' }, t)))),
            h('tbody', null, ...rows.map((r, i) => h('tr', null,
              h('td', null, String(i + 1)), h('td', null, r.moduleName), h('td', null, r.name),
              h('td', { class: 'r' }, String(r.l)), h('td', { class: 'r' }, String(r.w)), h('td', { class: 'r' }, String(r.t)),
              h('td', { class: 'r' }, String(r.qty)), h('td', null, r.matName), h('td', { class: 'r' }, String(Math.round(r.edgeMm))))))))
      );
    } else if (activeTab === 'labels') {
      const grid = h('div', {
        style: 'display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:10px; max-height:460px; overflow:auto; padding:4px;',
      });
      rows.forEach((r, idx) => {
        grid.append(
          h('div', {
            style: 'border:1.5px solid var(--line-2); border-radius:8px; padding:10px 12px; background:var(--panel); display:flex; flex-direction:column; gap:3px;',
          },
            h('div', { style: 'display:flex; justify-content:space-between; font-size:11px; color:var(--muted); border-bottom:1px dashed var(--line); padding-bottom:4px;' },
              h('b', null, `Поз. #${idx + 1}`),
              h('span', { style: 'font-weight:700; color:var(--accent);' }, `${r.qty} шт`),
            ),
            h('div', { style: 'font-size:11.5px; font-weight:700; color:var(--accent); margin-top:2px;' }, r.moduleName),
            h('div', { style: 'font-size:13.5px; font-weight:700; color:var(--ink);' }, r.name),
            h('div', { style: 'font-size:15px; font-weight:800; color:var(--ink); background:var(--panel-2); padding:3px 8px; border-radius:6px; align-self:flex-start; margin:2px 0;' }, `${r.l} × ${r.w} × ${r.t} мм`),
            h('div', { style: 'font-size:11px; color:var(--ink-2);' }, r.matName),
            h('div', { style: 'font-size:11px; font-weight:600; color:var(--ok);' }, r.edgeMm > 0 ? `Кромка ПВХ: ${Math.round(r.edgeMm)} мм` : 'Без кромления'),
          ),
        );
      });
      container.append(
        h('p', { class: 'hint' }, 'Готовые бирки для маркировки распиленных деталей в цехе. Нажмите «Печать листа бирок», чтобы распечатать стикеры.'),
        grid,
      );
    } else {
      const format = DEFAULT_SHEET_FORMATS[sheetFormatIndex] ?? DEFAULT_SHEET_FORMATS[0];
      const nesting = computeNesting(rows, store.settings.materials, format);

      if (!nesting.sheets.length) {
        container.append(h('p', { class: 'empty' }, 'Нет плитных деталей для раскроя.'));
        return;
      }

      if (activeSheetIndex >= nesting.sheets.length) activeSheetIndex = 0;
      const curSheet = nesting.sheets[activeSheetIndex];

      const statsBar = h('div', {
        style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; padding:10px 14px; background:var(--panel-2); border:1px solid var(--line); border-radius:10px;',
      },
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Всего листов'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--ink);' }, `${nesting.totalSheets} шт`),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'КУМ гарнитура'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--accent);' }, `${nesting.overallEfficiencyPercent}%`),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'КУМ этого листа'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--ok);' }, `${curSheet.efficiencyPercent}%`),
        ),
        h('div', null,
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Деталей на листе'),
          h('div', { style: 'font-size:16px; font-weight:700; color:var(--ink);' }, `${curSheet.parts.length} из ${nesting.totalPartsCount}`),
        ),
      );

      const sheetPills = h('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; margin:4px 0;' },
        ...nesting.sheets.map((s, idx) =>
          h('button', {
            type: 'button',
            class: `btn sm ${idx === activeSheetIndex ? 'primary' : 'ghost'}`,
            onClick: () => { activeSheetIndex = idx; renderContent(); },
          }, `Лист ${s.sheetIndex}: ${s.matName} (${s.efficiencyPercent}%)`)
        ),
      );

      const svgBox = h('div', {
        style: 'border:1px solid var(--line); border-radius:10px; padding:8px; background:#ffffff; overflow:auto; max-height:480px; display:flex; justify-content:center;',
      });
      svgBox.innerHTML = renderSheetSvg(curSheet);

      const sheetPartsTable = h('div', { class: 'scroll-x', style: 'margin-top:4px;' },
        h('table', { class: 'tbl dense' },
          h('thead', null, h('tr', null, h('th', null, '№ на карте'), h('th', null, 'Модуль'), h('th', null, 'Деталь'), h('th', { class: 'r' }, 'Длина'), h('th', { class: 'r' }, 'Ширина'), h('th', null, 'Поворот'), h('th', { class: 'r' }, 'Кромка, мм'))),
          h('tbody', null, ...curSheet.parts.map((p, i) => h('tr', null,
            h('td', { style: 'font-weight:700; color:var(--accent);' }, String(i + 1)),
            h('td', null, p.row.moduleName),
            h('td', null, p.row.name),
            h('td', { class: 'r' }, String(p.w)),
            h('td', { class: 'r' }, String(p.h)),
            h('td', null, p.rotated ? '90°' : '0°'),
            h('td', { class: 'r' }, String(Math.round(p.row.edgeMm))),
          ))),
        ),
      );

      container.append(
        statsBar,
        sheetPills,
        h('p', { class: 'hint' }, `Опил по периметру: ${format.margin} мм · Толщина пилы: ${format.kerf} мм · Синий пунктир: кромление.`),
        svgBox,
        sheetPartsTable,
      );
    }
  };

  renderContent();
  d.body.append(container);

  d.foot.append(
    btn('Скачать CSV / Excel (для ЧПУ)', 'primary', () => downloadBlob(new Blob([cutListCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${fileName(store.project.name)}-detalirovka.csv`), 'download'),
    btn('Печать бирок на детали', 'ghost', printLabelsWindow, 'printer'),
    btn('Печать раскроя (PDF)', 'ghost', () => { d.close(); printDoc('cut', store, est, viewer); }, 'printer'),
  );
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

      const tablesWrap = h('div', { style: 'margin-top:16px; display:flex; flex-direction:column; gap:16px;' });
      drilling.sides.forEach((side) => {
        if (!side.holes.length) return;
        const rows = side.holes.map((hole, hIdx) => {
          let drillLabel = `Ø${hole.diam} мм`;
          if (hole.depth) drillLabel += ` (гл. ${hole.depth} мм)`;
          return h('tr', null,
            h('td', { class: 'r', style: 'font-weight:700;' }, String(hIdx + 1)),
            h('td', null, hole.desc),
            h('td', { class: 'r', style: 'font-weight:600; color:#0284c7;' }, drillLabel),
            h('td', { class: 'r' }, `${hole.x} мм`),
            h('td', { class: 'r' }, `${hole.y} мм`),
          );
        });
        const tableBox = h('div', { class: 'scroll-x' },
          h('div', { style: 'font-weight:700; font-size:12px; margin-bottom:4px; color:#1e293b;' }, `Координатная карта присадки: ${side.name}`),
          h('table', { class: 'tbl dense' },
            h('thead', null, h('tr', null,
              h('th', { class: 'r' }, '№'),
              h('th', null, 'Крепёж / Фурнитура'),
              h('th', { class: 'r' }, 'Сверло / Глубина'),
              h('th', { class: 'r' }, 'Отступ X (сзади)'),
              h('th', { class: 'r' }, 'Отступ Y (снизу)'),
            )),
            h('tbody', null, ...rows),
          ),
        );
        tablesWrap.append(tableBox);
      });

      container.append(
        h('p', { class: 'hint' }, 'Сверловка боковин: точные координаты центров отверстий под евровинты-конфирматы 7×50, ответные планки петель (37 мм от кромки, шаг 32 мм), полкодержатели и направляющие ящиков.'),
        sidesWrap,
        tablesWrap,
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

// ——— проекты, база заказов (CRM) и управление доступом ———

const STATUS_LABELS: Record<ProjectStatus, { text: string; bg: string; color: string }> = {
  draft: { text: 'Черновик / Замер', bg: '#f1f5f9', color: '#475569' },
  approved: { text: 'Согласован', bg: '#e0f2fe', color: '#0369a1' },
  production: { text: 'В цеху (распил)', bg: '#fef3c7', color: '#b45309' },
  done: { text: 'Сдан клиенту', bg: '#dcfce7', color: '#15803d' },
};

export function showAuthGateModal(onAuthenticated: () => void, initialMode?: 'login' | 'register' | 'paywall'): void {
  const overlay = h('div', {
    style: 'position:fixed; inset:0; z-index:9999; background:rgba(15,20,36,0.68); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:16px; font-family:Inter,system-ui,sans-serif;',
  });

  const existingUser = getCurrentUser();
  let mode: 'login' | 'register' | 'paywall' =
    initialMode ?? (existingUser && !hasActiveSubscription(existingUser) ? 'paywall' : 'login');
  let selectedPlan: 'pro' | 'factory' = 'pro';

  const card = h('div', {
    style: 'width:100%; max-width:420px; background:#ffffff; border:1px solid #d0d5dd; border-radius:10px; padding:24px; color:#101828; box-shadow:0 20px 48px rgba(15,20,36,0.28); display:flex; flex-direction:column; gap:14px;',
  });

  const inpStyle = 'width:100%; padding:10px 12px; border-radius:6px; border:1px solid #d0d5dd; background:#ffffff; color:#101828; font-size:13.5px; outline:none;';

  const closeOverlay = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !location.pathname.endsWith('constructor.html')) {
      closeOverlay();
    }
  });

  const renderModal = () => {
    clear(card);
    const curUser = getCurrentUser();

    const header = h('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding-bottom:10px; border-bottom:1px solid #eaecf0;' },
      h('div', { style: 'display:flex; align-items:center; gap:10px;' },
        h('span', { style: 'display:inline-flex; width:30px; height:30px; border-radius:6px; background:#0f1424; color:#fff; align-items:center; justify-content:center; font-weight:800; font-size:13px; letter-spacing:0.02em;' }, 'AD'),
        h('div', null,
          h('div', { style: 'font-size:15px; font-weight:700; color:#101828; letter-spacing:-0.01em;' }, 'ADAL Constructor CAD'),
          h('div', { style: 'font-size:11.5px; color:#667085;' },
            mode === 'paywall' ? 'Требуется активный тариф для запуска 3D-цеха' : 'Вход в рабочее пространство цеха'),
        ),
      ),
      !location.pathname.endsWith('constructor.html')
        ? h('button', {
            type: 'button',
            style: 'border:0; background:transparent; color:#667085; cursor:pointer; padding:4px;',
            onClick: closeOverlay,
          }, icon('x', 16))
        : null,
    );
    card.append(header);

    if (mode === 'paywall' && curUser) {
      const userBanner = h('div', {
        style: 'background:#f9fafb; border:1px solid #eaecf0; border-radius:6px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; font-size:12.5px;',
      },
        h('div', null,
          h('div', { style: 'font-weight:700; color:#101828;' }, `${curUser.name} (${curUser.login})`),
          h('div', { style: 'color:#b42318; font-weight:600; margin-top:2px; font-size:11.5px;' }, 'Тариф не активирован — доступ к 3D-конструктору закрыт'),
        ),
        h('button', {
          type: 'button',
          style: 'border:1px solid #d0d5dd; background:#fff; border-radius:5px; padding:4px 8px; font-size:11.5px; cursor:pointer; font-weight:600;',
          onClick: () => {
            logoutCurrentUser();
            mode = 'login';
            renderModal();
          },
        }, 'Сменить'),
      );

      const planBox = h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:8px;' },
        h('div', {
          style: `border:${selectedPlan === 'pro' ? '1.5px solid #0f1424' : '1px solid #d0d5dd'}; background:${selectedPlan === 'pro' ? '#f8fafc' : '#fff'}; border-radius:6px; padding:10px; cursor:pointer;`,
          onClick: () => { selectedPlan = 'pro'; renderModal(); },
        },
          h('div', { style: 'font-weight:700; font-size:13px; color:#101828;' }, 'Цех Pro'),
          h('div', { style: 'font-weight:800; font-size:15px; color:#0f1424; margin:3px 0; font-variant-numeric:tabular-nums;' }, '14 900 ₸ / мес'),
          h('div', { style: 'font-size:11px; color:#475467; line-height:1.35;' }, '3D-сцена, раскрой 2800×2070, бирки, смета и договор РК'),
        ),
        h('div', {
          style: `border:${selectedPlan === 'factory' ? '1.5px solid #0f1424' : '1px solid #d0d5dd'}; background:${selectedPlan === 'factory' ? '#f8fafc' : '#fff'}; border-radius:6px; padding:10px; cursor:pointer;`,
          onClick: () => { selectedPlan = 'factory'; renderModal(); },
        },
          h('div', { style: 'font-weight:700; font-size:13px; color:#101828;' }, 'Мебельная Фабрика'),
          h('div', { style: 'font-weight:800; font-size:15px; color:#0f1424; margin:3px 0; font-variant-numeric:tabular-nums;' }, '39 900 ₸ / мес'),
          h('div', { style: 'font-size:11px; color:#475467; line-height:1.35;' }, 'До 10 технологов + облачная база заказов'),
        ),
      );

      const payBtn = h('button', {
        type: 'button',
        style: 'width:100%; padding:11px; border-radius:6px; border:0; background:#0f1424; color:#fff; font-weight:600; font-size:13.5px; cursor:pointer;',
        onClick: () => {
          window.location.href = `dashboard.html?tab=subscription&plan=${selectedPlan}`;
        },
      }, 'Перейти к оплате в Личном кабинете →');

      card.append(
        userBanner,
        h('p', { style: 'margin:0; font-size:12.5px; color:#475467; line-height:1.45;' },
          'В личном кабинете вы можете ознакомиться с тарифами, настроить прайс-лист цеха и активировать подписку:'),
        planBox,
        payBtn,
        h('a', {
          href: 'dashboard.html',
          style: 'text-align:center; font-size:12px; color:#475467; text-decoration:none; font-weight:600;',
        }, '← Вернуться в Личный кабинет'),
      );
      return;
    }

    const modeSwitch = h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; background:#f2f4f7; padding:3px; border-radius:6px; gap:3px;' },
      h('button', {
        type: 'button',
        style: `padding:6px; border-radius:4px; border:0; font-weight:600; font-size:12.5px; cursor:pointer; background:${mode === 'login' ? '#fff' : 'transparent'}; color:${mode === 'login' ? '#101828' : '#667085'}; box-shadow:${mode === 'login' ? '0 1px 2px rgba(16,24,40,0.06)' : 'none'};`,
        onClick: () => { mode = 'login'; renderModal(); },
      }, 'Вход в аккаунт'),
      h('button', {
        type: 'button',
        style: `padding:6px; border-radius:4px; border:0; font-weight:600; font-size:12.5px; cursor:pointer; background:${mode === 'register' ? '#fff' : 'transparent'}; color:${mode === 'register' ? '#101828' : '#667085'}; box-shadow:${mode === 'register' ? '0 1px 2px rgba(16,24,40,0.06)' : 'none'};`,
        onClick: () => { mode = 'register'; renderModal(); },
      }, 'Регистрация цеха'),
    );

    const errBox = h('div', {
      style: 'color:#b42318; font-size:12px; font-weight:600; display:none; padding:8px 10px; background:#fef3f2; border:1px solid #fecdca; border-radius:6px;',
    });

    const setErr = (msg: string) => {
      if (!msg) {
        errBox.textContent = '';
        errBox.style.display = 'none';
      } else {
        errBox.textContent = msg;
        errBox.style.display = 'block';
      }
    };

    const withEye = (inp: HTMLInputElement): HTMLElement => {
      const eye = h('button', {
        type: 'button',
        style: 'position:absolute; right:10px; top:50%; transform:translateY(-50%); border:0; background:transparent; color:#667085; font-size:11.5px; font-weight:600; cursor:pointer;',
        onClick: () => {
          const show = inp.type === 'password';
          inp.type = show ? 'text' : 'password';
          eye.textContent = show ? 'Скрыть' : 'Показать';
        },
      }, 'Показать');
      inp.style.paddingRight = '68px';
      return h('div', { style: 'position:relative;' }, inp, eye);
    };

    const googleBtn = h('button', {
      type: 'button',
      style: 'width:100%; padding:9px 14px; border-radius:6px; border:1px solid #d0d5dd; background:#ffffff; color:#101828; font-weight:600; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px;',
      onClick: () => {
        signInWithGoogleOAuth();
      },
    });
    googleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <span>Продолжить через Google</span>
    `;

    const divider = h('div', { style: 'display:flex; align-items:center; gap:10px; margin:1px 0;' },
      h('div', { style: 'flex:1; height:1px; background:#eaecf0;' }),
      h('span', { style: 'font-size:11px; color:#98a2b3; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;' }, 'или по email / логину'),
      h('div', { style: 'flex:1; height:1px; background:#eaecf0;' }),
    );

    if (mode === 'login') {
      const loginInput = h('input', { type: 'text', placeholder: 'Email или логин', autocomplete: 'username', style: inpStyle });
      const passInput = h('input', { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password', style: inpStyle });

      const forgotLink = h('div', { style: 'display:flex; justify-content:flex-end; margin-top:-6px;' },
        h('button', {
          type: 'button',
          style: 'border:0; background:transparent; font-size:11.5px; color:#475467; cursor:pointer; font-weight:600; padding:0;',
          onClick: () => {
            const email = loginInput.value.trim() || prompt('Укажите ваш Email для сброса пароля:');
            if (email) toast(`Запрос на восстановление пароля отправлен для ${email}`, 'ok');
          },
        }, 'Забыли пароль?'),
      );

      const submitLogin = async () => {
        setErr('');
        const val = loginInput.value.trim();
        if (!val) {
          setErr('Введите ваш email или логин');
          return;
        }
        if (!passInput.value) {
          setErr('Введите пароль');
          return;
        }
        await syncAccountFromCloud(val);
        const res = loginWithCredentials(val, passInput.value);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (location.pathname.endsWith('constructor.html') && !hasActiveSubscription(res.user)) {
          mode = 'paywall';
          renderModal();
          return;
        }
        overlay.remove();
        onAuthenticated();
      };

      loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
      passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void submitLogin(); });

      card.append(
        modeSwitch,
        googleBtn,
        divider,
        loginInput,
        withEye(passInput),
        forgotLink,
        errBox,
        h('button', {
          type: 'button',
          style: 'width:100%; padding:10px; border-radius:6px; border:0; background:#0f1424; color:#fff; font-weight:600; font-size:13.5px; cursor:pointer;',
          onClick: () => void submitLogin(),
        }, 'Войти в кабинет'),
      );
      setTimeout(() => loginInput.focus(), 40);
    } else {
      const nameInput = h('input', { type: 'text', placeholder: 'Имя или название цеха (например: ИП Астана Мебель)', autocomplete: 'organization', style: inpStyle });
      const loginInput = h('input', { type: 'email', placeholder: 'Рабочий Email', autocomplete: 'email', style: inpStyle });
      const passInput = h('input', { type: 'password', placeholder: 'Пароль (не менее 6 символов)', autocomplete: 'new-password', style: inpStyle });

      const submitReg = async () => {
        setErr('');
        const email = loginInput.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setErr('Введите корректный email (например, ceh@mail.kz)');
          return;
        }
        if (passInput.value.length < 6) {
          setErr('Пароль должен содержать минимум 6 символов');
          return;
        }
        await syncAccountFromCloud(email);
        const rawTitle = nameInput.value.trim();
        const res = registerAccount({
          name: rawTitle || email.split('@')[0],
          company: rawTitle || 'Мебельное производство',
          login: email,
          password: passInput.value,
        });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (location.pathname.endsWith('constructor.html')) {
          mode = 'paywall';
          renderModal();
          return;
        }
        overlay.remove();
        onAuthenticated();
      };

      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginInput.focus(); });
      loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
      passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void submitReg(); });

      card.append(
        modeSwitch,
        googleBtn,
        divider,
        nameInput,
        loginInput,
        withEye(passInput),
        errBox,
        h('button', {
          type: 'button',
          style: 'width:100%; padding:10px; border-radius:6px; border:0; background:#0f1424; color:#fff; font-weight:600; font-size:13.5px; cursor:pointer;',
          onClick: () => void submitReg(),
        }, 'Создать аккаунт и открыть кабинет'),
      );
      setTimeout(() => nameInput.focus(), 40);
    }
  };

  renderModal();
  overlay.append(card);
  document.body.appendChild(overlay);
}

export function projectsDialog(store: Store, onChanged: () => void, initialTab: 'projects' | 'access' | 'cloud' = 'projects'): void {
  const d = openDialog('База проектов, заказы и доступ', { wide: true });
  let activeTab: 'projects' | 'access' | 'cloud' = initialTab;
  let searchQuery = '';
  let statusFilter: 'all' | ProjectStatus = 'all';

  const container = h('div', { style: 'display:flex; flex-direction:column; gap:14px;' });

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

  const render = () => {
    clear(container);
    const curUser = getCurrentUser();
    const gateOn = isAccessGateEnabled();
    const cloudOn = isCloudConfigured();

    const tabs = h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--line); padding-bottom:10px;' },
      h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
        h('button', {
          type: 'button',
          class: `btn sm ${activeTab === 'projects' ? 'primary' : 'ghost'}`,
          onClick: () => { activeTab = 'projects'; render(); },
        }, 'Мои заказы и проекты'),
        h('button', {
          type: 'button',
          class: `btn sm ${activeTab === 'access' ? 'primary' : 'ghost'}`,
          onClick: () => { activeTab = 'access'; render(); },
        }, gateOn ? 'Доступ и логины (Защита ВКЛ)' : 'Доступ и логины'),
        h('button', {
          type: 'button',
          class: `btn sm ${activeTab === 'cloud' ? 'primary' : 'ghost'}`,
          onClick: () => { activeTab = 'cloud'; render(); },
        }, cloudOn ? 'Облачная БД (Подключена)' : 'Облачная БД (Supabase)'),
      ),
      curUser ? h('div', { style: 'font-size:12px; color:var(--muted);' },
        `Профиль: `, h('b', { style: 'color:var(--ink);' }, `${curUser.name} (${curUser.login})`),
      ) : null,
    );

    container.append(tabs);

    if (activeTab === 'projects') {
      // Карточка текущего открытого заказа (CRM-поля клиента)
      const p = store.project;
      const curCard = h('div', {
        style: 'background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:10px;',
      },
        h('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;' },
          h('b', { style: 'font-size:13.5px;' }, `Текущий заказ: ${p.name}`),
          h('div', { style: 'display:flex; gap:6px;' },
            btn('Сохранить в базу', 'sm primary', () => {
              if (saveToLibrary(store.project, store.settings)) {
                toast(cloudOn ? 'Проект сохранён локально и в облако БД' : 'Проект сохранён в базу');
                render();
                onChanged();
              } else {
                toast('Не хватает места в браузере', 'err');
              }
            }, 'check'),
            btn('Новый пустой проект', 'sm ghost', () => {
              if (!store.project.modules.length || confirm('Начать новый проект с чистого листа?')) {
                store.commit((proj) => {
                  proj.modules = [];
                  proj.name = 'Новый заказ';
                  proj.clientName = '';
                  proj.clientPhone = '';
                  proj.clientAddress = '';
                  proj.status = 'draft';
                }, 'new-clean');
                store.select(null);
                d.close();
                toast('Создан чистый проект');
              }
            }, 'plus'),
          ),
        ),
        h('div', { class: 'grid2', style: 'gap:8px;' },
          h('label', { class: 'fld' },
            h('span', { class: 'fld-l' }, 'Имя клиента / Заказчик'),
            h('input', {
              type: 'text',
              placeholder: 'Например: Айгуль Нурланова',
              value: p.clientName ?? '',
              onInput: (e: Event) => store.commit((pr) => { pr.clientName = (e.target as HTMLInputElement).value; }, 'crm-client'),
            }),
          ),
          h('label', { class: 'fld' },
            h('span', { class: 'fld-l' }, 'Телефон клиента (WhatsApp)'),
            h('input', {
              type: 'text',
              placeholder: '+7 777 000 00 00',
              value: p.clientPhone ?? '',
              onInput: (e: Event) => store.commit((pr) => { pr.clientPhone = (e.target as HTMLInputElement).value; }, 'crm-phone'),
            }),
          ),
          h('label', { class: 'fld' },
            h('span', { class: 'fld-l' }, 'Адрес / ЖК / Комната'),
            h('input', {
              type: 'text',
              placeholder: 'ЖК Sensata, кв. 45, прихожая',
              value: p.clientAddress ?? '',
              onInput: (e: Event) => store.commit((pr) => { pr.clientAddress = (e.target as HTMLInputElement).value; }, 'crm-addr'),
            }),
          ),
          h('label', { class: 'fld' },
            h('span', { class: 'fld-l' }, 'Статус заказа'),
            h('select', {
              onChange: (e: Event) => store.commit((pr) => { pr.status = (e.target as HTMLSelectElement).value as ProjectStatus; }, 'crm-status'),
            },
              h('option', { value: 'draft', selected: (p.status ?? 'draft') === 'draft' }, 'Черновик / Замер'),
              h('option', { value: 'approved', selected: p.status === 'approved' }, 'Согласован с клиентом'),
              h('option', { value: 'production', selected: p.status === 'production' }, 'В цеху (распил / сборка)'),
              h('option', { value: 'done', selected: p.status === 'done' }, 'Сдан клиенту'),
            ),
          ),
        ),
      );

      // Панель поиска и фильтрации сохраненных заказов
      const filterBar = h('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;' },
        h('input', {
          type: 'search',
          placeholder: 'Поиск по названию, имени клиента, телефону или ЖК…',
          value: searchQuery,
          style: 'flex:1; min-width:200px; padding:7px 11px; border:1px solid var(--line); border-radius:8px; font-size:13px;',
          onInput: (e: Event) => {
            searchQuery = (e.target as HTMLInputElement).value;
            renderList();
          },
        }),
        h('select', {
          style: 'padding:7px 10px; border:1px solid var(--line); border-radius:8px; font-size:13px;',
          onChange: (e: Event) => {
            statusFilter = (e.target as HTMLSelectElement).value as 'all' | ProjectStatus;
            renderList();
          },
        },
          h('option', { value: 'all', selected: statusFilter === 'all' }, 'Все статусы'),
          h('option', { value: 'draft', selected: statusFilter === 'draft' }, 'Черновик / Замер'),
          h('option', { value: 'approved', selected: statusFilter === 'approved' }, 'Согласован'),
          h('option', { value: 'production', selected: statusFilter === 'production' }, 'В цеху'),
          h('option', { value: 'done', selected: statusFilter === 'done' }, 'Сдан'),
        ),
        cloudOn ? btn('Загрузить из облака БД', 'sm ghost', async () => {
          const res = await pullProjectsFromCloud(store.settings);
          if (!res.ok) {
            toast(res.error ?? 'Ошибка загрузки из БД', 'err');
            return;
          }
          res.projects.forEach((cp) => saveToLibrary(cp, store.settings));
          toast(`Синхронизировано проектов из БД: ${res.projects.length}`);
          renderList();
        }, 'download') : null,
      );

      const listHost = h('div', { class: 'proj-list', style: 'max-height:320px; overflow:auto;' });

      const renderList = () => {
        clear(listHost);
        const q = searchQuery.trim().toLowerCase();
        const lib = loadLibrary(store.settings).filter((item) => {
          if (statusFilter !== 'all' && (item.status ?? 'draft') !== statusFilter) return false;
          if (!q) return true;
          const hay = `${item.name} ${item.clientName ?? ''} ${item.clientPhone ?? ''} ${item.clientAddress ?? ''}`.toLowerCase();
          return hay.includes(q);
        });

        if (!lib.length) {
          listHost.append(h('p', { class: 'empty' }, 'Сохранённых заказов по вашему запросу пока нет. Нажмите «Сохранить в базу» выше.'));
          return;
        }

        for (const item of lib) {
          const st = STATUS_LABELS[item.status ?? 'draft'];
          const estTotal = estimate(item.modules, store.settings).total;
          const clientLine = [item.clientName, item.clientPhone, item.clientAddress].filter(Boolean).join(' · ');

          listHost.append(h('div', { class: 'proj', style: 'align-items:center;' },
            h('div', { style: 'display:flex; flex-direction:column; gap:3px;' },
              h('div', { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
                h('b', { style: 'font-size:14px;' }, item.name),
                h('span', {
                  style: `font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:${st.bg}; color:${st.color};`,
                }, st.text),
                h('span', { style: 'font-size:12.5px; font-weight:700; color:var(--accent);' }, money(estTotal)),
              ),
              clientLine ? h('div', { style: 'font-size:12px; color:var(--ink-2);' }, `Клиент: ${clientLine}`) : null,
              h('small', { style: 'color:var(--muted);' }, `${item.modules.length} мод. · Обновлён: ${new Date(item.updatedAt).toLocaleString('ru-RU')}`),
            ),
            h('div', { class: 'proj-a' },
              btn('Открыть', 'sm primary', () => { store.loadProject(item); d.close(); toast(`Открыт заказ: ${item.name}`); }),
              h('button', {
                type: 'button', class: 'ib danger', 'aria-label': 'Удалить проект',
                onClick: () => {
                  if (confirm(`Удалить проект «${item.name}»?`)) {
                    deleteFromLibrary(item.id, store.settings);
                    renderList();
                  }
                },
              }, icon('trash', 16)),
            ),
          ));
        }
      };

      renderList();
      container.append(curCard, filterBar, listHost);

    } else if (activeTab === 'access') {
      // Вкладка управления паролями, пользователями и закрытым входом
      const accounts = loadAccounts();

      const gateToggleBox = h('div', {
        style: 'background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;',
      },
        h('div', null,
          h('div', { style: 'font-weight:700; font-size:13.5px;' }, 'Закрытый доступ к конструктору по логину и паролю'),
          h('div', { style: 'font-size:12px; color:var(--muted); margin-top:2px;' },
            'Если включено, при открытии конструктора посторонние увидят окно ввода логина и пароля. У каждого логина — своя изолированная папка проектов.',
          ),
        ),
        h('div', { style: 'display:flex; gap:8px; align-items:center;' },
          h('button', {
            type: 'button',
            class: `btn sm ${gateOn ? 'primary' : 'ghost'}`,
            onClick: () => {
              setAccessGateEnabled(!gateOn);
              toast(!gateOn ? 'Защита паролем при входе ВКЛЮЧЕНА' : 'Свободный вход без пароля включён');
              render();
            },
          }, gateOn ? 'Защита ВКЛЮЧЕНА (Выключить)' : 'Включить защиту паролем'),
          gateOn ? h('button', {
            type: 'button',
            class: 'btn sm ghost',
            onClick: () => {
              logoutCurrentUser();
              d.close();
              showAuthGateModal(() => {
                location.reload();
              });
            },
          }, 'Сменить аккаунт / Выйти') : null,
        ),
      );

      // Добавление нового пользователя (для платного доступа или сотрудников)
      const newLogin = h('input', { type: 'text', placeholder: 'Логин (например: master2)' });
      const newPass = h('input', { type: 'text', placeholder: 'Пароль (мин. 4 символа)' });
      const newName = h('input', { type: 'text', placeholder: 'Имя / Название цеха' });

      const addUserForm = h('div', {
        style: 'border:1px solid var(--line); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:10px;',
      },
        h('b', { style: 'font-size:13px;' }, 'Создать логин и пароль (для себя, цеха или платного подписчика):'),
        h('div', { class: 'grid2', style: 'gap:8px;' },
          h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Логин'), newLogin),
          h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Пароль'), newPass),
          h('label', { class: 'fld wide' }, h('span', { class: 'fld-l' }, 'Имя пользователя / Компания'), newName),
        ),
        h('div', null,
          btn('+ Добавить пользователя (с подпиской Pro)', 'sm primary', () => {
            const res = createAccount({
              login: newLogin.value,
              password: newPass.value,
              name: newName.value,
              role: 'pro',
              subscription: 'pro',
            });
            if (typeof res === 'string') {
              toast(res, 'err');
              return;
            }
            toast(`Создан доступ с подпиской Pro для: ${res.login}`);
            render();
          }),
        ),
      );

      const usersTable = h('div', { class: 'scroll-x' },
        h('table', { class: 'tbl dense' },
          h('thead', null, h('tr', null,
            h('th', null, 'Логин'),
            h('th', null, 'Пароль'),
            h('th', null, 'Имя / Цех'),
            h('th', null, 'Подписка (Доступ)'),
            h('th', null, 'Статус'),
            h('th', null, 'Действия'),
          )),
          h('tbody', null, ...accounts.map((acc) => {
            const sub = acc.role === 'admin' ? 'factory' : (acc.subscription ?? 'none');
            return h('tr', null,
              h('td', { style: 'font-weight:700;' }, acc.login),
              h('td', { style: 'font-family:monospace;' }, '••••••'),
              h('td', null, `${acc.name}${acc.company ? ' · ' + acc.company : ''}`),
              h('td', null,
                acc.role === 'admin'
                  ? h('span', { style: 'color:var(--ok); font-weight:700;' }, 'Администратор (Полный)')
                  : h('select', {
                      style: 'padding:3px 6px; border-radius:6px; border:1px solid var(--line); font-size:12px; font-weight:600;',
                      onChange: (e: Event) => {
                        const nextPlan = (e.target as HTMLSelectElement).value as SubscriptionPlan;
                        setAccountSubscription(acc.id, nextPlan);
                        toast(`Подписка ${acc.login}: ${nextPlan === 'none' ? 'Отключена' : nextPlan.toUpperCase()}`);
                        render();
                      },
                    },
                      h('option', { value: 'none', selected: sub === 'none' }, 'Нет подписки (Закрыт)'),
                      h('option', { value: 'pro', selected: sub === 'pro' }, 'Цех Pro (14 900 ₸)'),
                      h('option', { value: 'factory', selected: sub === 'factory' }, 'Фабрика (39 900 ₸)'),
                    ),
              ),
              h('td', null, acc.active ? 'Активен' : 'Приостановлен'),
              h('td', { style: 'display:flex; gap:6px;' },
                h('button', {
                  type: 'button',
                  class: 'btn sm ghost',
                  onClick: () => {
                    const np = prompt(`Новый пароль для пользователя «${acc.login}»:`, '');
                    if (np && updateAccountPassword(acc.id, np)) {
                      toast('Пароль обновлён');
                      render();
                    }
                  },
                }, 'Пароль'),
                acc.id !== 'usr_admin' ? h('button', {
                  type: 'button',
                  class: 'btn sm ghost',
                  onClick: () => {
                    toggleAccountActive(acc.id, !acc.active);
                    render();
                  },
                }, acc.active ? 'Блок.' : 'Вкл.') : null,
                acc.id !== 'usr_admin' ? h('button', {
                  type: 'button',
                  class: 'ib danger',
                  onClick: () => {
                    if (confirm(`Удалить пользователя «${acc.login}»?`)) {
                      deleteAccount(acc.id);
                      render();
                    }
                  },
                }, icon('trash', 15)) : null,
              ),
            );
          })),
        ),
      );

      container.append(gateToggleBox, addUserForm, usersTable);

    } else if (activeTab === 'cloud') {
      // Вкладка настройки облачной базы данных PostgreSQL (Supabase)
      const cfg = getCloudConfig();
      const urlInp = h('input', {
        type: 'url',
        placeholder: 'https://xxxx.supabase.co',
        value: cfg.url,
      });
      const keyInp = h('input', {
        type: 'text',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        value: cfg.anonKey,
      });

      const sqlSnippet = `create table if not exists public.mebel_projects (
  id text primary key,
  user_login text not null default 'admin',
  name text not null,
  client_name text default '',
  client_phone text default '',
  status text default 'draft',
  updated_at bigint not null,
  payload jsonb not null
);
alter table public.mebel_projects enable row level security;
create policy "Public access" on public.mebel_projects for all using (true) with check (true);`;

      container.append(
        h('div', {
          style: 'background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:12px 14px; font-size:13px; line-height:1.5;',
        },
          h('b', null, 'Облачная синхронизация PostgreSQL (Supabase): '),
          'По умолчанию все проекты надёжно сохраняются в памяти вашего браузера. Чтобы проекты автоматически синхронизировались между вашим телефоном, планшетом на замере и домашним ПК — укажите URL и Anon Key бесплатного проекта Supabase.',
        ),
        h('div', { class: 'grid2', style: 'gap:10px;' },
          h('label', { class: 'fld wide' }, h('span', { class: 'fld-l' }, 'Supabase Project URL'), urlInp),
          h('label', { class: 'fld wide' }, h('span', { class: 'fld-l' }, 'Supabase Anon Public Key'), keyInp),
        ),
        h('div', { style: 'display:flex; gap:8px; flex-wrap:wrap;' },
          btn('Сохранить подключение к БД', 'primary', async () => {
            setCloudConfig({ url: urlInp.value, anonKey: keyInp.value });
            if (isCloudConfigured()) {
              const res = await pushProjectToCloud(store.project);
              if (res.ok) toast('Облачная БД успешно подключена и синхронизирована');
              else toast(res.error ?? 'Проверьте ключи и наличие таблицы mebel_projects', 'err');
            } else {
              toast('Облачная синхронизация отключена (локальный режим)');
            }
            render();
          }, 'check'),
          btn('Скопировать SQL создания таблицы', 'ghost', async () => {
            try {
              await navigator.clipboard.writeText(sqlSnippet);
              toast('SQL-код скопирован в буфер обмена');
            } catch {
              toast('Скопируйте SQL из поля ниже вручную');
            }
          }, 'copy'),
        ),
        h('details', { class: 'more' },
          h('summary', null, 'SQL-скрипт для вставки в Supabase SQL Editor (выполняется 1 раз)'),
          h('pre', {
            style: 'margin-top:8px; padding:10px; background:#0f172a; color:#e2e8f0; border-radius:8px; font-size:11.5px; overflow-x:auto;',
          }, sqlSnippet),
        ),
      );
    }
  };

  render();
  d.body.append(container, file);
  d.foot.append(
    btn('Импорт из файла (.json)', 'ghost', () => file.click(), 'upload'),
    btn('Скачать проект файлом (.json)', 'ghost', () => downloadBlob(new Blob([projectToJson(store.project)], { type: 'application/json' }), `${fileName(store.project.name)}.mebel3d.json`), 'download'),
  );
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

  const room = store.project.room ?? DEFAULT_ROOM;
  let wallLength = Math.min(6000, Math.max(1600, Math.round(room.w / 50) * 50));
  let tiers: 2 | 3 = 3;
  let facadeMat = facadeMats.find((m) => m.id === 'm-ral1015')?.id ?? facadeMats[0]?.id ?? 'eg-w1000';
  let corpusMat = corpusMats.find((m) => m.id === 'eg-w1000')?.id ?? corpusMats[0]?.id ?? 'eg-w1000';
  let topMat = topMats.find((m) => m.id === 'top-f812')?.id ?? topMats[0]?.id ?? 'top-f812';
  let plinthColor: 'facade' | 'corpus' = 'facade';
  let millingMix: 'trend' | 'modern' | 'frame' | 'ribbed' = 'trend';
  let layoutVariant = 0; // 0: пенал слева, 1: пенал справа, 2: без пенала
  let shape: 'linear' | 'corner-left' = 'linear';
  let topTrimH = 60; // Верхняя доборная планка под потолок (карниз 60 мм по умолчанию)

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

    // Ярусы и верхняя планка
    const tiersWrap = h('div', { class: 'grp' },
      h('h3', null, '2. Конфигурация ярусов и верхней планки'),
      h('div', { class: 'btn-bar', style: 'margin-bottom:10px;' },
        h('button', {
          class: `btn sm ${tiers === 3 ? 'primary' : 'ghost'}`,
          onClick: () => { tiers = 3; renderContent(); },
        }, '3 яруса (Низ + Верх 720 мм + Антресоли на газлифтах)'),
        h('button', {
          class: `btn sm ${tiers === 2 ? 'primary' : 'ghost'}`,
          onClick: () => { tiers = 2; renderContent(); },
        }, '2 яруса (Низ + Верх 720 мм)'),
      ),
      h('div', { style: 'font-size:12px; color:#475569; margin-bottom:5px;' }, 'Верхняя доборная планка (цельный карниз под потолок):'),
      h('div', { class: 'btn-bar', style: 'flex-wrap:wrap; gap:6px;' },
        ...[
          [0, 'Без верхней планки'],
          [50, 'Планка 50 мм'],
          [60, 'Планка 60 мм (Стандарт)'],
          [80, 'Планка 80 мм'],
          [100, 'Планка 100 мм'],
        ].map(([th, lbl]) =>
          h('button', {
            class: `btn sm ${topTrimH === th ? 'primary' : 'ghost'}`,
            onClick: () => { topTrimH = Number(th); renderContent(); },
          }, String(lbl)),
        ),
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

    // Форма гарнитура
    const shapeWrap = h('div', { class: 'grp' },
      h('h3', null, '6. Форма гарнитура'),
      h('div', { class: 'btn-bar' },
        h('button', {
          class: `btn sm ${shape === 'linear' ? 'primary' : 'ghost'}`,
          onClick: () => { shape = 'linear'; renderContent(); },
        }, 'Прямая (вдоль стены)'),
        h('button', {
          class: `btn sm ${shape === 'corner-left' ? 'primary' : 'ghost'}`,
          onClick: () => { shape = 'corner-left'; renderContent(); },
        }, 'Угловая (Г-образная, угол слева 900×900)'),
      ),
    );

    container.append(desc, wallLenWrap, shapeWrap, tiersWrap, millingWrap, matsWrap, layoutWrap);
  };

  renderContent();
  d.body.append(container);

  const applyKitchen = () => {
    const { modules, notes } = planKitchen({
      wallLength,
      tiers,
      facadeMat,
      corpusMat,
      topMat,
      plinthColor,
      millingMix,
      layoutVariant,
      shape,
      topTrimH,
    }, room);

    if (!modules.length) {
      toast(notes[notes.length - 1] ?? 'Не удалось разместить кухню', 'err');
      return;
    }

    store.commit((p) => {
      p.modules = modules;
    }, 'kitchen-wizard');

    if (modules[0]) store.select(modules[0].id);
    viewer.frame('iso');
    toast(`Кухня собрана: ${modules.length} модулей.`);
    notes.slice(0, 3).forEach((n) => toast(n));
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

// ——— AI Конструктор мебели по текстовому описанию ———

export function aiConstructorDialog(store: Store, viewer: Viewer): void {
  const d = openDialog('AI Конструктор мебели', { wide: true });
  let currentPrompt = 'Шкаф 2.4м на 1.8м на 60см трехдверный кашемир с рейками';
  let activeTab: 'wardrobes' | 'kitchens' | 'living' = 'wardrobes';

  const container = h('div', { class: 'ai-body', style: 'display:flex; flex-direction:column; gap:16px;' });

  const categories = [
    { id: 'wardrobes' as const, label: 'Шкафы и гардеробные' },
    { id: 'kitchens' as const, label: 'Кухонные гарнитуры' },
    { id: 'living' as const, label: 'ТВ-тумбы, комоды и стеллажи' },
  ];

  const presetsMap = {
    wardrobes: [
      'Шкаф 2.4м на 1.8м на 60см трехдверный кашемир с рейками',
      'Шкаф-купе 2400х1800х600 в прихожую с зеркалом и 4 ящиками',
      'Шкаф в спальню 2.4м графит с зеркалом и 2 штангами',
      'Встроенный шкаф до потолка 3 двери без ручек белый',
    ],
    kitchens: [
      'Прямая кухня 2.4м со столешницей и мойкой',
      'Кухонный гарнитур 3 метра графит с ящиками и верхними шкафами',
      'Кухня 1.8м кашемир с сушкой для посуды и вытяжкой',
      'Мини-кухня 1.6м белый глянец со столешницей под мрамор',
    ],
    living: [
      'Подвесная тумба ТВ 1800мм на 2 ящика push-to-open',
      'Комод 1000х900х450 на 4 ящика в цвете графит',
      'Стеллаж для книг 800х2200 с полками дуб сонома',
      'Обувница в прихожую 800х1000 компактная',
    ],
  };

  const renderContent = () => {
    clear(container);

    const desc = h('div', { style: 'background:rgba(99,102,241,0.08); border-left:4px solid var(--accent); padding:10px 14px; border-radius:8px; font-size:13px; line-height:1.5; color:var(--ink);' },
      h('b', null, 'Умный ИИ-генератор мебели для цеха: '),
      'Опишите изделие естественным языком в метрах, см или мм. Нейросеть распознает габариты, количество створок, тип открывания, внутреннее наполнение (ящики, штанги, полки), декоры EGGER и фурнитуру, генерируя готовую параметрическую модель.',
    );

    const tabButtons = h('div', { style: 'display:flex; gap:8px; border-bottom:1px solid var(--line); padding-bottom:8px;' },
      ...categories.map((c) =>
        h('button', {
          type: 'button',
          class: `btn sm ${activeTab === c.id ? 'primary' : 'ghost'}`,
          style: 'font-size:12px;',
          onClick: () => {
            activeTab = c.id;
            renderContent();
          },
        }, c.label)
      ),
    );

    const chipsWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:6px;' },
      ...presetsMap[activeTab].map((txt) =>
        h('button', {
          type: 'button',
          class: 'btn sm ghost',
          style: 'font-size:12px; border:1px solid var(--line);',
          onClick: () => {
            currentPrompt = txt;
            textInput.value = txt;
            updatePreview();
          },
        }, txt)
      ),
    );

    const textInput = h('textarea', {
      style: 'width:100%; min-height:85px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-family:inherit; font-size:13.5px; resize:vertical; outline:none; background:var(--panel-2); color:var(--ink);',
      placeholder: 'Опишите мебель: например, Шкаф 2.4м на 1.8м трехдверный кашемир с рейками и ящиками',
      value: currentPrompt,
      onInput: (e: Event) => {
        currentPrompt = (e.target as HTMLTextAreaElement).value;
        updatePreview();
      },
    });

    const previewCard = h('div', {
      style: 'background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:14px 16px;',
    });

    const updatePreview = () => {
      clear(previewCard);
      const res = parseFurniturePrompt(currentPrompt);
      const modsToEst = res.modules?.length ? res.modules : [res.module];
      const estRes = estimate(modsToEst, store.settings);

      const headerRow = h('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:6px;' },
        h('div', null,
          h('div', { style: 'font-size:15px; font-weight:700; color:var(--ink);' }, res.title),
          h('div', { style: 'font-size:12.5px; color:var(--ink-2); margin-top:2px;' }, res.description),
        ),
        h('div', { style: 'text-align:right;' },
          h('div', { style: 'font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:600;' }, 'Ориентир сметы'),
          h('div', { style: 'font-size:16px; font-weight:800; color:var(--accent);' }, money(estRes.total)),
        ),
      );

      const tagsWrap = h('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;' },
        ...res.features.map((f) =>
          h('span', { style: 'display:inline-block; padding:4px 10px; border-radius:6px; background:var(--panel); border:1px solid var(--line); font-size:12px; font-weight:600; color:var(--accent);' }, f)
        ),
      );

      let modulesListEl: HTMLElement | null = null;
      if (res.modules && res.modules.length > 1) {
        modulesListEl = h('div', { style: 'margin-top:12px; padding-top:10px; border-top:1px dashed var(--line); font-size:12px; color:var(--ink-2);' },
          h('div', { style: 'font-weight:700; color:var(--ink); margin-bottom:4px;' }, `Состав гарнитура (${res.modules.length} модулей):`),
          h('div', { style: 'display:flex; flex-wrap:wrap; gap:6px;' },
            ...res.modules.map((m) =>
              h('span', { style: 'padding:2px 8px; border-radius:4px; background:rgba(0,0,0,0.04); font-size:11px;' }, `${m.name} (${m.w} мм)`)
            ),
          ),
        );
      }

      previewCard.append(headerRow, tagsWrap);
      if (modulesListEl) previewCard.append(modulesListEl);
    };

    updatePreview();

    container.append(
      desc,
      h('div', { class: 'grp' },
        h('h3', { style: 'margin-bottom:6px;' }, 'Категории и готовые шаблоны:'),
        tabButtons,
        h('div', { style: 'margin-top:8px;' }, chipsWrap),
      ),
      h('div', { class: 'grp' },
        h('h3', { style: 'margin-bottom:6px;' }, 'Текстовый запрос на русском языке:'),
        textInput,
      ),
      h('div', { class: 'grp' },
        h('h3', { style: 'margin-bottom:6px;' }, 'Распознанная конфигурация:'),
        previewCard,
      ),
    );
  };

  renderContent();
  d.body.append(container);

  d.foot.append(
    h('button', {
      class: 'btn ghost',
      onClick: () => {
        const res = parseFurniturePrompt(currentPrompt);
        const newMods = res.modules?.length ? res.modules : [res.module];
        store.commit((p) => {
          p.modules = newMods;
          p.name = res.title.replace('AI-Генерация: ', '');
        }, 'ai-replace');
        store.select(newMods[0]?.id ?? null);
        viewer.frame('iso');
        toast(`Проект создан: ${pName(res.title)}`);
        d.close();
      },
    }, 'Заменить проект'),
    h('button', {
      class: 'btn primary',
      style: 'font-weight:700;',
      onClick: () => {
        const res = parseFurniturePrompt(currentPrompt);
        const newMods = res.modules?.length ? res.modules : [res.module];
        const existing = store.project.modules;
        const offset = existing.length > 0 ? Math.max(...existing.map((m) => m.x + m.w)) : 0;
        newMods.forEach((m) => { m.x += offset; });
        store.commit((p) => {
          p.modules.push(...newMods);
        }, 'ai-add');
        store.select(newMods[0]?.id ?? null);
        viewer.frame('iso');
        toast(`Добавлено модулей: ${newMods.length}`);
        d.close();
      },
    }, 'Добавить в 3D сцену'),
  );
}

function pName(t: string): string {
  return t.replace('AI-Генерация: ', '');
}


