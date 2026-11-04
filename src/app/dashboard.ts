import '@fontsource-variable/inter';
import '../styles/dashboard.css';
import {
  getCurrentUser,
  hasActiveSubscription,
  logoutCurrentUser,
  setAccountSubscription,
  handleAuthRedirectCallback,
  updateAccountProfile,
  updateAccountPassword,
  isCloudConfigured,
  type UserAccount,
} from '../core/auth';
import {
  loadLibrary,
  saveToLibrary,
  deleteFromLibrary,
  saveCurrent,
  loadSettings,
  saveSettings,
  syncCloudLibraryToLocal,
  projectFromJson,
} from '../core/storage';
import { DEFAULT_SETTINGS, PRESETS } from '../core/defaults';
import { DEFAULT_ROOM } from '../core/room';
import { generateKitchenLayout } from '../core/kitchenWizard';
import { estimate } from '../core/estimate';
import { fmtNum, money, uid } from '../core/util';
import type { Project, ProjectStatus, Settings } from '../core/types';
import { clear, h, icon } from '../ui/dom';

type Tab = 'projects' | 'pricing' | 'subscription' | 'settings';

function dashToast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div', { class: 'toast ' + (kind === 'err' ? 'err' : '') }, msg);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3000);
  setTimeout(() => t.remove(), 3400);
}

function makeSampleKitchenProject(): Project {
  const mods = generateKitchenLayout({
    wallLength: 2600,
    tiers: 3,
    facadeMat: 'eg-u702',
    corpusMat: 'eg-w1000',
    topMat: 'top-f812',
    plinthColor: 'facade',
    millingMix: 'modern',
    layoutVariant: 0,
    shape: 'linear',
    topTrimH: 60,
  });
  for (const m of mods) {
    if (m.kind === 'tall' && m.x === 0) m.hinge = 'left';
  }
  return {
    v: 1,
    id: `ord_${uid()}`,
    name: 'Кухня 2600 мм (3 яруса до потолка)',
    updatedAt: Date.now(),
    modules: mods,
    room: { ...DEFAULT_ROOM, w: 2600, d: 2000, h: 2590, windows: [], doors: [] },
    clientName: 'Алия Нурланова',
    clientPhone: '+7 701 550 12 34',
    clientAddress: 'г. Астана, ЖК Sensata, кв. 84',
    status: 'approved',
  };
}

function makeSampleWardrobeProject(): Project {
  const preset = PRESETS.find((p) => p.id === 'wardrobe-hinged') ?? PRESETS[0];
  const m = preset.make();
  m.x = 200;
  m.w = 1800;
  m.h = 2400;
  m.d = 580;
  m.plinth = 80;
  m.topTrim = 60;
  m.matFacade = 'eg-h1180';
  m.matCorpus = 'eg-w1000';
  m.plinthColor = 'facade';
  return {
    v: 1,
    id: `ord_${uid()}`,
    name: 'Шкаф-гардероб распашной 1800×2400',
    updatedAt: Date.now() - 3600_000 * 5,
    modules: [m],
    room: { ...DEFAULT_ROOM, w: 2400, d: 2000, h: 2550, windows: [], doors: [] },
    clientName: 'Тимур Касымов',
    clientPhone: '+7 777 210 98 76',
    clientAddress: 'г. Алматы, ЖК Highvill, блок С',
    status: 'production',
  };
}

function printProjectContract(p: Project, settings: Settings): void {
  const est = estimate(p.modules, settings);
  const w = window.open('', '_blank');
  if (!w) {
    dashToast('Разрешите всплывающие окна в браузере для печати Договора', 'err');
    return;
  }
  const cur = '₸';
  const comp = settings.company;
  const matMap = new Map(settings.materials.map((m) => [m.id, m.name]));
  const firstMod = p.modules[0];
  const corpusName = firstMod ? (matMap.get(firstMod.matCorpus) ?? 'ЛДСП 16 мм') : 'ЛДСП 16 мм';
  const facadeName = firstMod ? (matMap.get(firstMod.matFacade) ?? 'МДФ 18 мм') : 'МДФ 18 мм';
  const topName = firstMod ? (matMap.get(firstMod.matTop) ?? 'Столешница 38 мм') : 'Столешница 38 мм';
  const advance70 = Math.round(est.total * 0.7);
  const balance30 = Math.max(0, est.total - advance70);
  const today = new Date().toLocaleDateString('ru-RU');
  const contractNum = `${new Date().getFullYear()}-${p.id.slice(-4).toUpperCase()}`;

  const rowsHtml = p.modules
    .map(
      (m, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td><b>${m.name}</b></td>
      <td style="text-align:center;">${m.w} × ${m.h} × ${m.d}</td>
      <td style="text-align:right;">${money(est.perModule[m.id] ?? 0, cur)}</td>
    </tr>
  `,
    )
    .join('');

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
}

function copyProjectWhatsappKp(p: Project, settings: Settings): void {
  const est = estimate(p.modules, settings);
  const cur = '₸';
  const lines = [
    `*Коммерческое предложение: ${p.name}*`,
    p.clientName ? `Заказчик: ${p.clientName}` : '',
    p.clientAddress ? `Объект: ${p.clientAddress}` : '',
    '',
    '*Спецификация модулей (Ш×В×Г):*',
    ...p.modules.map((m, idx) => `${idx + 1}. ${m.name} (${m.w}×${m.h}×${m.d} мм) — ${money(est.perModule[m.id] ?? 0, cur)}`),
    '',
    `Комплектация: плитные материалы EGGER/AGT, кромление ПВХ, фурнитура с доводчиками, раскрой и сборка.`,
    `*ИТОГО ПОД КЛЮЧ: ${money(est.total, cur)}*`,
    settings.company.name ? `\n${settings.company.name}${settings.company.phone ? ' · ' + settings.company.phone : ''}` : '',
  ].filter(Boolean);
  void navigator.clipboard.writeText(lines.join('\n'));
  dashToast('Текст КП скопирован в буфер обмена для отправки в WhatsApp');
}

function openClientEditModal(p: Project, settings: Settings, onSaved: () => void): void {
  const backdrop = h('div', { class: 'dash-modal-backdrop' });
  const nameInp = h('input', { class: 'inp-d', type: 'text', value: p.name, placeholder: 'Название заказа' });
  const clientInp = h('input', { class: 'inp-d', type: 'text', value: p.clientName ?? '', placeholder: 'ФИО заказчика' });
  const phoneInp = h('input', { class: 'inp-d', type: 'text', value: p.clientPhone ?? '', placeholder: '+7 701 000 00 00' });
  const addrInp = h('input', { class: 'inp-d', type: 'text', value: p.clientAddress ?? '', placeholder: 'Город, ЖК, квартира' });

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const modal = h(
    'div',
    { class: 'dash-modal' },
    h(
      'div',
      { class: 'dash-modal-head' },
      h('span', { class: 'dash-modal-title' }, 'Карточка заказа и реквизиты клиента'),
      h('button', { type: 'button', class: 'btn-d sm', onClick: close }, icon('x', 14)),
    ),
    h(
      'div',
      { class: 'dash-modal-body' },
      h('label', { class: 'fld-group' }, h('span', { class: 'fld-label' }, 'Наименование проекта'), nameInp),
      h('label', { class: 'fld-group' }, h('span', { class: 'fld-label' }, 'ФИО Заказчика (для Договора и КП)'), clientInp),
      h('label', { class: 'fld-group' }, h('span', { class: 'fld-label' }, 'Контактный телефон (WhatsApp)'), phoneInp),
      h('label', { class: 'fld-group' }, h('span', { class: 'fld-label' }, 'Адрес доставки и монтажа'), addrInp),
    ),
    h(
      'div',
      { class: 'dash-modal-foot' },
      h('button', { type: 'button', class: 'btn-d', onClick: close }, 'Отмена'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d primary',
          onClick: () => {
            p.name = nameInp.value.trim() || p.name;
            p.clientName = clientInp.value.trim();
            p.clientPhone = phoneInp.value.trim();
            p.clientAddress = addrInp.value.trim();
            saveToLibrary(p, settings);
            close();
            dashToast('Данные заказа сохранены');
            onSaved();
          },
        },
        'Сохранить изменения',
      ),
    ),
  );

  backdrop.append(modal);
  document.body.appendChild(backdrop);
}

function openCheckoutModal(user: UserAccount, initialPlan: 'pro' | 'factory', onActivated: () => void): void {
  const backdrop = h('div', { class: 'dash-modal-backdrop' });
  let plan: 'pro' | 'factory' = initialPlan;
  let payMethod: 'kaspi' | 'card' | 'invoice' = 'kaspi';

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const modal = h('div', { class: 'dash-modal', style: 'max-width:540px;' });

  const renderModal = () => {
    clear(modal);
    const price = plan === 'pro' ? '14 900 ₸' : '39 900 ₸';
    const planTitle = plan === 'pro' ? 'Тариф «Цех Pro» (30 дней)' : 'Тариф «Мебельная Фабрика» (30 дней)';
    const invNum = `INV-${new Date().getFullYear()}-${user.id.slice(-4).toUpperCase()}`;

    const methodTabs = h(
      'div',
      { style: 'display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; background:#f2f4f7; padding:4px; border-radius:6px;' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d sm',
          style: `border:0; background:${payMethod === 'kaspi' ? '#fff' : 'transparent'}; font-weight:${payMethod === 'kaspi' ? '700' : '500'};`,
          onClick: () => {
            payMethod = 'kaspi';
            renderModal();
          },
        },
        'Kaspi QR / Pay',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d sm',
          style: `border:0; background:${payMethod === 'card' ? '#fff' : 'transparent'}; font-weight:${payMethod === 'card' ? '700' : '500'};`,
          onClick: () => {
            payMethod = 'card';
            renderModal();
          },
        },
        'Карта Visa / MC',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d sm',
          style: `border:0; background:${payMethod === 'invoice' ? '#fff' : 'transparent'}; font-weight:${payMethod === 'invoice' ? '700' : '500'};`,
          onClick: () => {
            payMethod = 'invoice';
            renderModal();
          },
        },
        'Счёт на ИП / ТОО',
      ),
    );

    const planSwitch = h(
      'div',
      { style: 'display:grid; grid-template-columns:1fr 1fr; gap:8px;' },
      h(
        'div',
        {
          style: `padding:10px 12px; border-radius:6px; border:${plan === 'pro' ? '1.5px solid #101828' : '1px solid #d0d5dd'}; background:${plan === 'pro' ? '#f9fafb' : '#fff'}; cursor:pointer;`,
          onClick: () => {
            plan = 'pro';
            renderModal();
          },
        },
        h('div', { style: 'font-weight:700; font-size:12.5px;' }, 'Цех Pro'),
        h('div', { style: 'font-family:var(--mono); font-weight:700; font-size:15px; margin-top:2px;' }, '14 900 ₸ / мес'),
      ),
      h(
        'div',
        {
          style: `padding:10px 12px; border-radius:6px; border:${plan === 'factory' ? '1.5px solid #101828' : '1px solid #d0d5dd'}; background:${plan === 'factory' ? '#f9fafb' : '#fff'}; cursor:pointer;`,
          onClick: () => {
            plan = 'factory';
            renderModal();
          },
        },
        h('div', { style: 'font-weight:700; font-size:12.5px;' }, 'Мебельная Фабрика'),
        h('div', { style: 'font-family:var(--mono); font-weight:700; font-size:15px; margin-top:2px;' }, '39 900 ₸ / мес'),
      ),
    );

    const bodyContent = h('div', null);

    if (payMethod === 'kaspi') {
      const qrBox = h('div', {
        style: 'display:grid; grid-template-columns:132px 1fr; gap:16px; align-items:center; padding:14px; border:1px solid #e4e7ec; border-radius:6px; background:#f9fafb;',
      });
      const qrSvg = h('div', {
        style: 'width:132px; height:132px; background:#fff; border:1px solid #d0d5dd; border-radius:6px; padding:8px; display:flex; align-items:center; justify-content:center;',
      });
      qrSvg.innerHTML = `
        <svg viewBox="0 0 100 100" width="112" height="112" fill="#101828">
          <rect x="6" y="6" width="26" height="26" fill="none" stroke="#101828" stroke-width="4"/>
          <rect x="12" y="12" width="14" height="14"/>
          <rect x="68" y="6" width="26" height="26" fill="none" stroke="#101828" stroke-width="4"/>
          <rect x="74" y="12" width="14" height="14"/>
          <rect x="6" y="68" width="26" height="26" fill="none" stroke="#101828" stroke-width="4"/>
          <rect x="12" y="74" width="14" height="14"/>
          <rect x="40" y="8" width="6" height="6"/><rect x="52" y="8" width="6" height="12"/>
          <rect x="40" y="20" width="6" height="12"/><rect x="46" y="38" width="12" height="6"/>
          <rect x="8" y="42" width="12" height="6"/><rect x="26" y="42" width="6" height="12"/>
          <rect x="40" y="50" width="6" height="12"/><rect x="54" y="48" width="10" height="6"/>
          <rect x="70" y="42" width="6" height="12"/><rect x="84" y="46" width="10" height="6"/>
          <rect x="40" y="68" width="12" height="6"/><rect x="58" y="66" width="6" height="14"/>
          <rect x="70" y="68" width="12" height="6"/><rect x="86" y="72" width="8" height="12"/>
          <rect x="44" y="82" width="8" height="12"/><rect x="68" y="84" width="12" height="10"/>
        </svg>
      `;
      qrBox.append(
        qrSvg,
        h(
          'div',
          { style: 'display:flex; flex-direction:column; gap:6px;' },
          h('div', { style: 'font-size:11px; font-weight:700; text-transform:uppercase; color:#b42318; letter-spacing:0.04em;' }, 'Kaspi Pay · Моментальное зачисление'),
          h('div', { style: 'font-weight:700; font-size:14px;' }, `${planTitle}`),
          h('div', { style: 'font-size:12px; color:#475467; line-height:1.4;' }, 'Отсканируйте QR-код в приложении Kaspi.kz или нажмите «Подтвердить оплату» для мгновенного открытия 3D-конструктора.'),
          h('div', { style: 'font-family:var(--mono); font-size:11.5px; color:#667085;' }, `Счёт: ${invNum} · Сумма: ${price}`),
        ),
      );
      bodyContent.append(qrBox);
    } else if (payMethod === 'card') {
      bodyContent.append(
        h(
          'div',
          { style: 'display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid #e4e7ec; border-radius:6px; background:#f9fafb;' },
          h('div', { style: 'display:flex; justify-content:space-between; align-items:center;' },
            h('span', { style: 'font-size:12px; font-weight:700; color:#101828;' }, 'Корпоративная или личная карта (Visa / Mastercard)'),
            h('span', { style: 'font-family:var(--mono); font-size:11px; color:#1d4ed8; font-weight:700;' }, 'VISA BUSINESS · 3DS'),
          ),
          h('input', { class: 'inp-d', type: 'text', placeholder: 'Номер карты (4400 •••• •••• ••••)', value: '4400 4301 8821 0944' }),
          h(
            'div',
            { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px;' },
            h('input', { class: 'inp-d', type: 'text', placeholder: 'ММ / ГГ', value: '09/28' }),
            h('input', { class: 'inp-d', type: 'password', placeholder: 'CVV', value: '777' }),
          ),
        ),
      );
    } else {
      bodyContent.append(
        h(
          'div',
          { style: 'display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid #e4e7ec; border-radius:6px; background:#f9fafb;' },
          h('div', { style: 'font-size:12px; font-weight:700; color:#101828;' }, 'Выставление счёта на оплату для юридических лиц РК (ИП / ТОО)'),
          h('input', { class: 'inp-d', type: 'text', placeholder: 'БИН / ИИН компании (12 цифр)', value: '980440001293' }),
          h('input', { class: 'inp-d', type: 'text', placeholder: 'Наименование ИП / ТОО', value: user.company || user.name }),
          h('div', { style: 'font-size:11.5px; color:#667085;' }, 'При формировании счёта доступ к 3D-конструктору открывается сразу на время проведения банковского платежа.'),
        ),
      );
    }

    modal.append(
      h(
        'div',
        { class: 'dash-modal-head' },
        h('span', { class: 'dash-modal-title' }, 'Активация лицензии ADAL Constructor CAD'),
        h('button', { type: 'button', class: 'btn-d sm', onClick: close }, icon('x', 14)),
      ),
      h('div', { class: 'dash-modal-body' }, planSwitch, methodTabs, bodyContent),
      h(
        'div',
        { class: 'dash-modal-foot' },
        h('button', { type: 'button', class: 'btn-d', onClick: close }, 'Отмена'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn-d blue',
            onClick: () => {
              setAccountSubscription(user.id, plan);
              close();
              dashToast(`Лицензия «${plan === 'pro' ? 'Цех Pro' : 'Мебельная Фабрика'}» активирована на 30 дней. Доступ к 3D открыт.`);
              onActivated();
            },
          },
          `Подтвердить оплату (${price}) и открыть 3D →`,
        ),
      ),
    );
  };

  renderModal();
  backdrop.append(modal);
  document.body.appendChild(backdrop);
}

function initDashboard(): void {
  handleAuthRedirectCallback();

  const boot = () => {
    const curUser = getCurrentUser();
    if (!curUser) {
      window.location.href = 'index.html';
      return;
    }
    mountDashboard(curUser);
  };

  if (!getCurrentUser()) {
    setTimeout(boot, 120);
  } else {
    boot();
  }
}

function mountDashboard(initialUser: UserAccount): void {
  const app = document.getElementById('dash-app');
  if (!app) return;

  const urlParams = new URLSearchParams(window.location.search);
  const initialTabParam = urlParams.get('tab') as Tab | null;
  const initialPlanParam = urlParams.get('plan') as 'pro' | 'factory' | null;

  let activeTab: Tab =
    initialTabParam && ['projects', 'pricing', 'subscription', 'settings'].includes(initialTabParam)
      ? initialTabParam
      : 'projects';

  let searchQuery = '';
  let statusFilter: 'all' | ProjectStatus = 'all';
  let matCatFilter = 'all';

  const settings = loadSettings();
  void syncCloudLibraryToLocal(settings).then((count) => {
    if (count > 0) render();
  });

  const openProjectIn3D = (proj: Project, user: UserAccount) => {
    if (!hasActiveSubscription(user)) {
      openCheckoutModal(user, 'pro', () => {
        saveCurrent(proj);
        window.location.href = `constructor.html?project=${encodeURIComponent(proj.id)}`;
      });
      return;
    }
    saveCurrent(proj);
    window.location.href = `constructor.html?project=${encodeURIComponent(proj.id)}`;
  };

  const launchEmptyOrCurrent3D = (user: UserAccount) => {
    if (!hasActiveSubscription(user)) {
      openCheckoutModal(user, 'pro', () => {
        window.location.href = 'constructor.html';
      });
      return;
    }
    window.location.href = 'constructor.html';
  };

  const render = () => {
    const user = getCurrentUser() ?? initialUser;
    const isSubActive = hasActiveSubscription(user);
    const curSettings = loadSettings();
    const projects = loadLibrary(curSettings);

    clear(app);

    const layout = h('div', { class: 'dash-layout' });

    // ——— Боковая панель (Dark Graphite CAD Rail) ———
    const launchBtn = h(
      'button',
      {
        type: 'button',
        class: `btn-launch-cad ${isSubActive ? '' : 'is-locked'}`,
        onClick: () => launchEmptyOrCurrent3D(user),
      },
      h(
        'span',
        { style: 'display:inline-flex; align-items:center; gap:8px;' },
        icon('cube', 16),
        isSubActive ? 'Открыть 3D-Конструктор' : '3D-Конструктор (Закрыт)',
      ),
      h('span', { style: 'font-family:var(--mono); font-size:11px; opacity:0.85;' }, isSubActive ? '→' : 'ТАРИФ'),
    );

    const navItem = (tab: Tab, label: string, ic: string, pillText?: string, pillCls = '') =>
      h(
        'button',
        {
          type: 'button',
          class: `dash-nav-btn ${activeTab === tab ? 'active' : ''}`,
          onClick: () => {
            activeTab = tab;
            render();
          },
        },
        h('span', { class: 'dash-nav-btn-left' }, icon(ic, 16), h('span', null, label)),
        pillText ? h('span', { class: `nav-pill ${pillCls}` }, pillText) : null,
      );

    const initials = (user.name || user.login).slice(0, 2).toUpperCase();

    const sidebar = h(
      'aside',
      { class: 'dash-sidebar' },
      h(
        'div',
        { class: 'dash-brand-row' },
        h(
          'a',
          { href: 'index.html', class: 'dash-brand' },
          icon('cube', 18),
          h('span', null, 'ADAL Constructor'),
        ),
        h('span', { class: 'dash-version' }, 'CAD v2.4'),
      ),
      h('div', { class: 'dash-launch-box' }, launchBtn),
      h('div', { class: 'dash-nav-label' }, 'Управление производством'),
      h(
        'nav',
        { class: 'dash-nav' },
        navItem('projects', 'Заказы и 3D-проекты', 'folder', String(projects.length)),
        navItem('pricing', 'Прайс-лист и нормы цеха', 'sliders', `${curSettings.materials.length} поз.`),
        navItem(
          'subscription',
          'Тариф и лицензия',
          'calc',
          isSubActive ? (user.subscription === 'factory' ? 'FACTORY' : 'PRO') : 'LOCKED',
          isSubActive ? 'ok' : 'warn',
        ),
        navItem('settings', 'Реквизиты и профиль', 'tools'),
      ),
      h(
        'div',
        { class: 'dash-sidebar-foot' },
        h(
          'div',
          { class: 'dash-user-meta' },
          h('div', { class: 'dash-avatar' }, initials),
          h(
            'div',
            { class: 'dash-user-text' },
            h('div', { class: 'dash-user-name' }, user.name || user.login),
            h('div', { class: 'dash-user-login' }, user.company ? `${user.company} · ${user.login}` : user.login),
          ),
        ),
        h(
          'div',
          { class: 'dash-foot-actions' },
          h('a', { href: 'index.html', class: 'btn-rail-sec' }, 'На главную'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn-rail-sec',
              onClick: () => {
                logoutCurrentUser();
                window.location.href = 'index.html';
              },
            },
            'Выйти',
          ),
        ),
      ),
    );

    // ——— Рабочая область ———
    const tabNames: Record<Tab, string> = {
      projects: 'Реестр заказов и 3D-проектов',
      pricing: 'Прайс-лист материалов, фурнитуры и работ цеха',
      subscription: 'Управление лицензией и подпиской',
      settings: 'Реквизиты ИП / ТОО и настройки аккаунта',
    };

    const topbar = h(
      'header',
      { class: 'dash-topbar' },
      h(
        'div',
        { class: 'dash-breadcrumb' },
        h('span', null, curSettings.company.name || user.company || 'Цех'),
        h('span', null, '/'),
        h('strong', null, tabNames[activeTab]),
      ),
      h(
        'div',
        { class: 'dash-topbar-right' },
        h(
          'span',
          { class: `status-chip ${isSubActive ? 'active' : 'locked'}` },
          h('span', { class: 'status-dot' }),
          isSubActive
            ? `Лицензия активна: ${user.subscription === 'factory' ? 'Мебельная Фабрика' : 'Цех Pro'}`
            : 'Доступ к 3D-конструктору ожидает оплаты',
        ),
        isSubActive
          ? h(
              'button',
              { type: 'button', class: 'btn-d primary sm', onClick: () => launchEmptyOrCurrent3D(user) },
              icon('cube', 14),
              'В 3D-цех →',
            )
          : h(
              'button',
              {
                type: 'button',
                class: 'btn-d blue sm',
                onClick: () => openCheckoutModal(user, 'pro', () => render()),
              },
              'Активировать тариф',
            ),
      ),
    );

    const contentHost = h('div', { class: 'dash-content' });

    // Полоса статуса доступа к конструктору
    const gateStrip = h(
      'div',
      { class: `gate-strip ${isSubActive ? 'is-active' : 'is-locked'}` },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'gate-strip-title' },
          isSubActive
            ? 'Промышленный 3D-конструктор, раскрой 2800×2070 мм и печать бирок разблокированы'
            : 'Конструктор закрыт до оплаты — выберите тариф для запуска 3D-проектирования и карт раскроя',
        ),
        h(
          'div',
          { class: 'gate-strip-sub' },
          isSubActive
            ? `Аккаунт: ${user.login} · Облачная синхронизация PostgreSQL: ${isCloudConfigured() ? 'Подключена' : 'Локальный режим'}`
            : 'В бесплатном режиме кабинета вы можете настроить прайс-лист своего цеха, реквизиты для договора и ознакомиться с реестром проектов.',
        ),
      ),
      isSubActive
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn-d primary',
              onClick: () => {
                window.location.href = 'constructor.html?new=1';
              },
            },
            icon('plus', 15),
            'Новый 3D-проект по замеру',
          )
        : h(
            'button',
            {
              type: 'button',
              class: 'btn-d blue',
              onClick: () => openCheckoutModal(user, 'pro', () => render()),
            },
            'Оплатить подписку (14 900 ₸) →',
          ),
    );

    contentHost.append(gateStrip);

    if (activeTab === 'projects') {
      renderProjectsSection(contentHost, projects, curSettings, user, isSubActive, {
        searchQuery,
        onSearch: (q) => {
          searchQuery = q;
          render();
        },
        statusFilter,
        onStatusFilter: (st) => {
          statusFilter = st;
          render();
        },
        onOpen3D: (proj) => openProjectIn3D(proj, user),
        onRefresh: () => render(),
      });
    } else if (activeTab === 'pricing') {
      renderPricingSection(contentHost, curSettings, matCatFilter, (cat) => {
        matCatFilter = cat;
        render();
      }, () => render());
    } else if (activeTab === 'subscription') {
      renderSubscriptionSection(contentHost, user, isSubActive, () => render());
    } else if (activeTab === 'settings') {
      renderSettingsSection(contentHost, user, curSettings, () => render());
    }

    const workspace = h('div', { class: 'dash-workspace' }, topbar, contentHost);
    layout.append(sidebar, workspace);
    app.append(layout);
  };

  render();

  if (initialPlanParam === 'pro' || initialPlanParam === 'factory') {
    const u = getCurrentUser() ?? initialUser;
    if (!hasActiveSubscription(u)) {
      window.history.replaceState(null, '', 'dashboard.html?tab=subscription');
      openCheckoutModal(u, initialPlanParam, () => render());
    }
  }
}

// ——— ВКЛАДКА 1: ЗАКАЗЫ И 3D-ПРОЕКТЫ ———

interface ProjectsSectionOpts {
  searchQuery: string;
  onSearch: (q: string) => void;
  statusFilter: 'all' | ProjectStatus;
  onStatusFilter: (st: 'all' | ProjectStatus) => void;
  onOpen3D: (p: Project) => void;
  onRefresh: () => void;
}

function renderProjectsSection(
  host: HTMLElement,
  projects: Project[],
  settings: Settings,
  user: UserAccount,
  isSubActive: boolean,
  opts: ProjectsSectionOpts,
): void {
  // Считаем сводную инженерную аналитику по всем проектам
  let totalPortfolio = 0;
  let totalMargin = 0;
  let totalArea = 0;
  let totalEdge = 0;

  const estByProj = new Map<string, ReturnType<typeof estimate>>();
  for (const p of projects) {
    const e = estimate(p.modules, settings);
    estByProj.set(p.id, e);
    totalPortfolio += e.total;
    totalMargin += e.markup;
    totalArea += e.area;
    totalEdge += e.edge.qty;
  }

  const sheetsCount = Math.ceil((totalArea * (1 + settings.waste / 100)) / 5.796);
  const inProdCount = projects.filter((p) => p.status === 'production' || p.status === 'approved').length;

  const kpiMatrix = h(
    'div',
    { class: 'kpi-matrix' },
    h(
      'div',
      { class: 'kpi-cell' },
      h('span', { class: 'kpi-label' }, 'Заказов в реестре'),
      h('span', { class: 'kpi-val' }, `${projects.length}`),
      h('span', { class: 'kpi-sub' }, `В работе / согласовано: ${inProdCount}`),
    ),
    h(
      'div',
      { class: 'kpi-cell' },
      h('span', { class: 'kpi-label' }, 'Сумма портфеля заказов (КП)'),
      h('span', { class: 'kpi-val' }, money(totalPortfolio, '₸')),
      h('span', { class: 'kpi-sub' }, 'Расчёт по актуальному прайсу цеха'),
    ),
    h(
      'div',
      { class: 'kpi-cell' },
      h('span', { class: 'kpi-label' }, 'Потребность в плите и кромке'),
      h('span', { class: 'kpi-val' }, `${fmtNum(totalArea)} м²`),
      h('span', { class: 'kpi-sub' }, `~${sheetsCount} л. (2800×2070) · Кромка: ${fmtNum(totalEdge)} м.п.`),
    ),
    h(
      'div',
      { class: 'kpi-cell' },
      h('span', { class: 'kpi-label' }, `Плановая маржа цеха (${settings.labor.markup}%)`),
      h('span', { class: 'kpi-val', style: 'color:var(--ok);' }, `+ ${money(totalMargin, '₸')}`),
      h('span', { class: 'kpi-sub' }, 'Чистая прибыль за вычетом плит и работ'),
    ),
  );

  // Быстрый старт нового заказа по параметрическим шаблонам
  const tplGrid = h(
    'div',
    { class: 'tpl-grid' },
    h(
      'div',
      { class: 'tpl-card' },
      h(
        'div',
        null,
        h('span', { class: 'tpl-tag' }, 'ШАБЛОН 01 · КУХНЯ 3 ЯРУСА'),
        h('div', { class: 'tpl-title' }, 'Кухонный гарнитур до потолка'),
        h('div', { class: 'tpl-meta' }, 'Габариты: 2600 × 2590 × 600 мм · Фасады EGGER U702 Кашемир · Столешница 38 мм · Цоколь и карниз.'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d primary sm',
          onClick: () => {
            const p = makeSampleKitchenProject();
            saveToLibrary(p, settings);
            opts.onOpen3D(p);
          },
        },
        icon('plus', 14),
        isSubActive ? 'Создать и открыть в 3D →' : 'Создать проект (Требуется тариф)',
      ),
    ),
    h(
      'div',
      { class: 'tpl-card' },
      h(
        'div',
        null,
        h('span', { class: 'tpl-tag' }, 'ШАБЛОН 02 · ГАРДЕРОБНАЯ'),
        h('div', { class: 'tpl-title' }, 'Шкаф распашной 3-секционный'),
        h('div', { class: 'tpl-meta' }, 'Габариты: 1800 × 2400 × 580 мм · EGGER H1180 Дуб Галифакс · Штанги, выдвижные ящики и полки.'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d primary sm',
          onClick: () => {
            const p = makeSampleWardrobeProject();
            saveToLibrary(p, settings);
            opts.onOpen3D(p);
          },
        },
        icon('plus', 14),
        isSubActive ? 'Создать и открыть в 3D →' : 'Создать проект (Требуется тариф)',
      ),
    ),
    h(
      'div',
      { class: 'tpl-card' },
      h(
        'div',
        null,
        h('span', { class: 'tpl-tag' }, 'ШАБЛОН 03 · СВОБОДНЫЙ ЗАМЕР'),
        h('div', { class: 'tpl-title' }, 'Чистая 3D-комната по размерам стен'),
        h('div', { class: 'tpl-meta' }, 'Построение стен, окон и дверей по замеру клиента, ИИ-генератор по тексту и мастер планировки.'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d sm',
          onClick: () => {
            if (!isSubActive) {
              openCheckoutModal(user, 'pro', () => {
                window.location.href = 'constructor.html?new=1';
              });
              return;
            }
            window.location.href = 'constructor.html?new=1';
          },
        },
        icon('cube', 14),
        'Открыть пустую 3D-сцену →',
      ),
    ),
  );

  // Панель фильтрации и реестр заказов
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onChange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const imported = projectFromJson(await f.text(), settings);
      if (!imported) {
        dashToast('Не удалось прочитать JSON-файл проекта', 'err');
        return;
      }
      saveToLibrary(imported, settings);
      dashToast(`Импортирован заказ: ${imported.name}`);
      opts.onRefresh();
    },
  });

  const searchInp = h('input', {
    class: 'inp-d',
    type: 'search',
    placeholder: 'Поиск по названию заказа, ФИО клиента, телефону или ЖК…',
    value: opts.searchQuery,
    style: 'max-width:340px;',
    onInput: (e: Event) => {
      opts.onSearch((e.target as HTMLInputElement).value);
    },
  });

  const statusSel = h(
    'select',
    {
      class: 'inp-d',
      style: 'width:auto; min-width:170px;',
      onChange: (e: Event) => {
        opts.onStatusFilter((e.target as HTMLSelectElement).value as 'all' | ProjectStatus);
      },
    },
    h('option', { value: 'all', selected: opts.statusFilter === 'all' }, 'Все статусы заказов'),
    h('option', { value: 'draft', selected: opts.statusFilter === 'draft' }, 'Замер / Черновик'),
    h('option', { value: 'approved', selected: opts.statusFilter === 'approved' }, 'Согласован с клиентом'),
    h('option', { value: 'production', selected: opts.statusFilter === 'production' }, 'В распиле (Цех)'),
    h('option', { value: 'done', selected: opts.statusFilter === 'done' }, 'Сдан клиенту'),
  );

  const q = opts.searchQuery.trim().toLowerCase();
  const filtered = projects.filter((p) => {
    if (opts.statusFilter !== 'all' && (p.status ?? 'draft') !== opts.statusFilter) return false;
    if (!q) return true;
    const hay = `${p.name} ${p.clientName ?? ''} ${p.clientPhone ?? ''} ${p.clientAddress ?? ''}`.toLowerCase();
    return hay.includes(q);
  });

  const tablePanel = h('div', { class: 'panel-box' });
  tablePanel.append(
    h(
      'div',
      { class: 'panel-head' },
      h('div', { style: 'display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex:1;' }, searchInp, statusSel),
      h(
        'div',
        { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn-d sm',
            onClick: () => fileInput.click(),
          },
          icon('upload', 14),
          'Импорт (.json)',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn-d sm',
            onClick: async () => {
              const cnt = await syncCloudLibraryToLocal(settings);
              dashToast(`Синхронизация с БД завершена (обновлено: ${cnt})`);
              opts.onRefresh();
            },
          },
          icon('download', 14),
          'Синхронизировать с БД',
        ),
      ),
    ),
  );

  if (filtered.length === 0) {
    tablePanel.append(
      h(
        'div',
        { class: 'panel-body', style: 'text-align:center; padding:40px 20px;' },
        h('div', { style: 'font-weight:700; font-size:15px; color:var(--ink);' }, 'В реестре пока нет сохранённых заказов'),
        h(
          'div',
          { style: 'font-size:12.5px; color:var(--muted); max-width:480px; margin:6px auto 18px;' },
          'Создайте новый 3D-проект по одному из шаблонов выше или загрузите контрольные производственные заказы для проверки сметы, раскроя и печати договора РК.',
        ),
        h(
          'div',
          { style: 'display:inline-flex; gap:10px; flex-wrap:wrap; justify-content:center;' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn-d primary',
              onClick: () => {
                const k = makeSampleKitchenProject();
                const w = makeSampleWardrobeProject();
                saveToLibrary(w, settings);
                saveToLibrary(k, settings);
                dashToast('Загружены 2 производственных заказа (Кухня 2600 мм и Шкаф 1800 мм)');
                opts.onRefresh();
              },
            },
            icon('folder', 15),
            'Загрузить 2 образца заказов цеха (Кухня + Шкаф)',
          ),
        ),
      ),
    );
  } else {
    const tbody = h('tbody', null);
    for (const p of filtered) {
      const est = estByProj.get(p.id) ?? estimate(p.modules, settings);
      const st = p.status ?? 'draft';
      const totalWidth = p.modules.reduce((acc, m) => Math.max(acc, m.x + m.w), 0);

      const stSelect = h(
        'select',
        {
          class: `status-select st-${st}`,
          onChange: (e: Event) => {
            p.status = (e.target as HTMLSelectElement).value as ProjectStatus;
            saveToLibrary(p, settings);
            dashToast(`Статус заказа «${p.name}» обновлён`);
            opts.onRefresh();
          },
        },
        h('option', { value: 'draft', selected: st === 'draft' }, 'Замер / Черновик'),
        h('option', { value: 'approved', selected: st === 'approved' }, 'Согласован'),
        h('option', { value: 'production', selected: st === 'production' }, 'В распиле (Цех)'),
        h('option', { value: 'done', selected: st === 'done' }, 'Сдан клиенту'),
      );

      tbody.append(
        h(
          'tr',
          null,
          h(
            'td',
            null,
            h('div', { class: 'ord-code' }, `#${p.id.slice(-6).toUpperCase()} · ${new Date(p.updatedAt).toLocaleDateString('ru-RU')}`),
            h('div', { class: 'ord-title' }, p.name),
            h('div', { style: 'font-size:11.5px; color:var(--muted); margin-top:2px;' }, `Модулей: ${p.modules.length} ед. · Ширина по стене: ${totalWidth} мм`),
          ),
          h(
            'td',
            null,
            p.clientName
              ? h('div', { style: 'font-weight:600; color:var(--ink);' }, p.clientName)
              : h('div', { style: 'color:var(--muted); font-size:12px;' }, 'Клиент не указан'),
            p.clientPhone ? h('div', { style: 'font-family:var(--mono); font-size:11.5px; color:var(--ink-2);' }, p.clientPhone) : null,
            p.clientAddress ? h('div', { style: 'font-size:11.5px; color:var(--muted);' }, p.clientAddress) : null,
            h(
              'button',
              {
                type: 'button',
                style: 'border:0; background:transparent; padding:0; margin-top:3px; font-size:11px; font-weight:600; color:var(--accent-blue); cursor:pointer;',
                onClick: () => openClientEditModal(p, settings, opts.onRefresh),
              },
              'Изм. реквизиты клиента',
            ),
          ),
          h('td', null, stSelect),
          h(
            'td',
            { class: 'r-num' },
            h('div', { style: 'font-weight:600;' }, `${fmtNum(est.area)} м²`),
            h('div', { style: 'font-size:11px; color:var(--muted);' }, `Кромка: ${fmtNum(est.edge.qty)} м`),
          ),
          h(
            'td',
            { class: 'r-num' },
            h('div', { style: 'font-weight:700; font-size:13.5px; color:var(--ink);' }, money(est.total, '₸')),
            h('div', { style: 'font-size:11px; color:var(--ok); font-weight:600;' }, `Маржа: +${money(est.markup, '₸')}`),
          ),
          h(
            'td',
            { style: 'text-align:right; white-space:nowrap;' },
            h(
              'div',
              { style: 'display:inline-flex; gap:6px; align-items:center;' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-d primary sm',
                  onClick: () => opts.onOpen3D(p),
                },
                icon('cube', 13),
                'В 3D-цех',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-d sm',
                  title: 'Сформировать и распечатать Договор бытового подряда РК',
                  onClick: () => printProjectContract(p, settings),
                },
                icon('printer', 13),
                'Договор',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-d sm',
                  title: 'Скопировать текст КП для отправки клиенту в WhatsApp',
                  onClick: () => copyProjectWhatsappKp(p, settings),
                },
                icon('copy', 13),
                'КП',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-d danger sm',
                  title: 'Удалить заказ',
                  onClick: () => {
                    deleteFromLibrary(p.id, settings);
                    dashToast(`Заказ «${p.name}» удалён`);
                    opts.onRefresh();
                  },
                },
                icon('trash', 13),
              ),
            ),
          ),
        ),
      );
    }

    tablePanel.append(
      h(
        'div',
        { class: 'data-table-wrap' },
        h(
          'table',
          { class: 'data-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, 'Код / Проект'),
              h('th', null, 'Заказчик и объект'),
              h('th', null, 'Статус в цеху'),
              h('th', { class: 'r-num' }, 'Плита / Кромка'),
              h('th', { class: 'r-num' }, 'Стоимость (КП)'),
              h('th', { style: 'text-align:right;' }, 'Действия'),
            ),
          ),
          tbody,
        ),
      ),
    );
  }

  host.append(kpiMatrix, tplGrid, tablePanel, fileInput);
}

// ——— ВКЛАДКА 2: ПРАЙС-ЛИСТ И НОРМЫ ЦЕХА ———

function renderPricingSection(
  host: HTMLElement,
  settings: Settings,
  matCatFilter: string,
  onCatFilter: (cat: string) => void,
  onRefresh: () => void,
): void {
  const s: Settings = structuredClone(settings);

  const saveAll = () => {
    saveSettings(s);
    dashToast('Прайс-лист и производственные коэффициенты цеха сохранены');
    onRefresh();
  };

  const numField = (label: string, hint: string, val: number, onChange: (v: number) => void) =>
    h(
      'label',
      { class: 'fld-group' },
      h('span', { class: 'fld-label' }, label),
      h('input', {
        class: 'inp-d',
        type: 'number',
        value: String(val),
        onInput: (e: Event) => onChange(Number((e.target as HTMLInputElement).value) || 0),
      }),
      h('span', { class: 'fld-hint' }, hint),
    );

  // Нормы раскроя и работ
  const normsPanel = h(
    'div',
    { class: 'panel-box' },
    h(
      'div',
      { class: 'panel-head' },
      h('span', { class: 'panel-head-title' }, '1. Производственные коэффициенты, распил и рентабельность цеха'),
      h(
        'div',
        { style: 'display:flex; gap:8px;' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn-d sm',
            onClick: () => {
              saveSettings(structuredClone(DEFAULT_SETTINGS));
              dashToast('Установлены заводские цены по Республике Казахстан');
              onRefresh();
            },
          },
          'Сбросить к базовым ценам РК',
        ),
        h('button', { type: 'button', class: 'btn-d primary sm', onClick: saveAll }, icon('check', 14), 'Сохранить прайс-лист'),
      ),
    ),
    h(
      'div',
      { class: 'panel-body form-grid-3' },
      numField('Технологический отход плиты (%)', 'Запас на раскрой и обрезь листа', s.waste, (v) => (s.waste = v)),
      numField('Кромление ПВХ с работой (₸ / пог.м)', 'Стоимость ленты ПВХ и станка за 1 м.п.', s.edgePrice, (v) => (s.edgePrice = v)),
      numField('Наценка / Чистая прибыль цеха (%)', 'Добавляется сверх себестоимости плит и работ', s.labor.markup, (v) => (s.labor.markup = v)),
      numField('Распил и присадка в цеху (%)', 'Процент от стоимости плитных материалов', s.labor.shop, (v) => (s.labor.shop = v)),
      numField('Контрольная сборка и монтаж (%)', 'Процент от материалов на сборку', s.labor.assembly, (v) => (s.labor.assembly = v)),
      numField('Доставка и логистика (%)', 'Транспортные расходы по городу', s.labor.logistics, (v) => (s.labor.logistics = v)),
    ),
  );

  // Прайс фурнитуры
  const hwKeys = Object.keys(s.hardware);
  const hwPanel = h(
    'div',
    { class: 'panel-box' },
    h('div', { class: 'panel-head' }, h('span', { class: 'panel-head-title' }, '2. Закупочные цены на мебельную фурнитуру и системы выдвижения')),
    h(
      'div',
      { class: 'panel-body form-grid-3' },
      ...hwKeys.map((k) => {
        const item = s.hardware[k];
        return numField(`${item.name} (₸ / ${item.unit})`, `Единица учёта в смете: ${item.unit}`, item.price, (v) => {
          item.price = v;
        });
      }),
    ),
  );

  // Каталог плитных материалов
  const categories = Array.from(new Set(s.materials.map((m) => m.category || 'Прочие')));
  const filteredMats = s.materials.filter((m) => matCatFilter === 'all' || (m.category || 'Прочие') === matCatFilter);

  const kindLabel: Record<string, string> = {
    sheet: 'ЛДСП 16 мм (Корпус)',
    facade: 'МДФ / Фасадная плита',
    top: 'Столешница 38 мм',
    back: 'ХДФ 4 мм (Стенка)',
  };

  const matPanel = h(
    'div',
    { class: 'panel-box' },
    h(
      'div',
      { class: 'panel-head' },
      h('span', { class: 'panel-head-title' }, '3. Прайс-лист плитных материалов (EGGER, AGT, Столешницы)'),
      h(
        'div',
        { style: 'display:flex; gap:8px; align-items:center;' },
        h(
          'select',
          {
            class: 'inp-d',
            style: 'width:auto;',
            onChange: (e: Event) => onCatFilter((e.target as HTMLSelectElement).value),
          },
          h('option', { value: 'all', selected: matCatFilter === 'all' }, 'Все коллекции (' + s.materials.length + ')'),
          ...categories.map((c) => h('option', { value: c, selected: matCatFilter === c }, c)),
        ),
        h('button', { type: 'button', class: 'btn-d primary sm', onClick: saveAll }, icon('check', 14), 'Сохранить цены'),
      ),
    ),
    h(
      'div',
      { class: 'data-table-wrap' },
      h(
        'table',
        { class: 'data-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Декор и артикул'),
            h('th', null, 'Коллекция'),
            h('th', null, 'Назначение в 3D'),
            h('th', { class: 'r-num', style: 'width:180px;' }, 'Цена за 1 м² (₸)'),
          ),
        ),
        h(
          'tbody',
          null,
          ...filteredMats.map((m) =>
            h(
              'tr',
              null,
              h(
                'td',
                null,
                h(
                  'div',
                  { style: 'display:flex; align-items:center; gap:10px;' },
                  h('span', { class: 'swatch-dot', style: `background:${m.color};` }),
                  h('span', { style: 'font-weight:600;' }, m.name),
                ),
              ),
              h('td', { style: 'color:var(--muted); font-size:12px;' }, m.category || 'Базовые'),
              h('td', { style: 'font-family:var(--mono); font-size:11.5px; color:var(--ink-2);' }, kindLabel[m.kind] || m.kind),
              h(
                'td',
                { class: 'r-num' },
                h('input', {
                  class: 'inp-d',
                  type: 'number',
                  step: '100',
                  value: String(m.price),
                  style: 'text-align:right; font-family:var(--mono); font-weight:600; width:130px;',
                  onInput: (e: Event) => {
                    m.price = Number((e.target as HTMLInputElement).value) || 0;
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  host.append(normsPanel, hwPanel, matPanel);
}

// ——— ВКЛАДКА 3: ТАРИФ И БИЛЛИНГ ———

function renderSubscriptionSection(host: HTMLElement, user: UserAccount, isSubActive: boolean, onRefresh: () => void): void {
  const curPlan = user.subscription ?? 'none';
  const untilStr = user.subscriptionUntil ? new Date(user.subscriptionUntil).toLocaleDateString('ru-RU') : 'Не ограничено';

  const statusPanel = h(
    'div',
    { class: 'panel-box' },
    h('div', { class: 'panel-head' }, h('span', { class: 'panel-head-title' }, 'Текущий статус лицензии цеха')),
    h(
      'div',
      { class: 'panel-body', style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;' },
      h(
        'div',
        { style: 'display:flex; flex-direction:column; gap:4px;' },
        h(
          'div',
          { style: 'font-size:15px; font-weight:700;' },
          isSubActive
            ? `Активный тариф: ${curPlan === 'factory' ? 'Мебельная Фабрика (Корпоративный)' : 'Цех Pro (Производственный)'}`
            : 'Тариф не подключен — 3D-конструктор находится в режиме ожидания оплаты',
        ),
        h(
          'div',
          { style: 'font-size:12.5px; color:var(--muted);' },
          isSubActive
            ? `Лицензия привязана к аккаунту ${user.login} · Действует до: ${untilStr}`
            : 'Оформите подписку ниже (Kaspi QR, банковская карта Visa/MC или счёт на ИП/ТОО), чтобы мгновенно разблокировать 3D-проектирование.',
        ),
      ),
      isSubActive
        ? h(
            'div',
            { style: 'display:flex; gap:8px;' },
            h(
              'a',
              { href: 'constructor.html', class: 'btn-d primary' },
              icon('cube', 15),
              'Перейти в 3D-Конструктор →',
            ),
          )
        : null,
    ),
  );

  const plansGrid = h(
    'div',
    { class: 'plans-grid' },
    // Тариф Цех Pro
    h(
      'div',
      { class: 'plan-card is-pro' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'plan-head-row' },
          h('div', { style: 'font-size:18px; font-weight:700;' }, 'Цех Pro'),
          h('span', { class: 'plan-tag featured' }, 'СТАНДАРТ ДЛЯ ЦЕХА'),
        ),
        h('div', { class: 'plan-price' }, '14 900 ₸ ', h('span', null, '/ месяц')),
        h('div', { style: 'font-size:12.5px; color:var(--muted);' }, 'Полный цикл от замера у клиента до карт раскроя и печати договора подряда.'),
        h(
          'ul',
          { class: 'plan-specs' },
          h('li', null, 'Безлимитное 3D-проектирование кухонь (до потолка) и шкафов по размерам стен'),
          h('li', null, 'Автоматический раскрой плит 2800×2070 мм с расчётом КИМ и кромки ПВХ'),
          h('li', null, 'Инженерные чертежи сверловки (присадка петель 35 мм и конфирматов) + рентген X-Ray'),
          h('li', null, 'Печать цеховых бирок со штрихкодом на каждую деталь'),
          h('li', null, 'Двойная смета (КП для клиента + себестоимость цеха) и Договор подряда РК (PDF)'),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d primary',
          style: 'width:100%; padding:11px;',
          onClick: () => openCheckoutModal(user, 'pro', onRefresh),
        },
        curPlan === 'pro' && isSubActive ? 'Продлить тариф «Цех Pro» (14 900 ₸)' : 'Подключить «Цех Pro» — 14 900 ₸ →',
      ),
    ),
    // Тариф Мебельная Фабрика
    h(
      'div',
      { class: 'plan-card' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'plan-head-row' },
          h('div', { style: 'font-size:18px; font-weight:700;' }, 'Мебельная Фабрика'),
          h('span', { class: 'plan-tag' }, 'ДЛЯ САЛОНОВ И КОМАНД'),
        ),
        h('div', { class: 'plan-price' }, '39 900 ₸ ', h('span', null, '/ месяц')),
        h('div', { style: 'font-size:12.5px; color:var(--muted);' }, 'Для производств с отделом продаж, замерщиками на выезде и технологами.'),
        h(
          'ul',
          { class: 'plan-specs' },
          h('li', null, 'Все возможности тарифа «Цех Pro» без ограничений'),
          h('li', null, 'До 10 рабочих аккаунтов сотрудников (дизайнеры, замерщики, цех)'),
          h('li', null, 'Единая облачная база данных заказов PostgreSQL (синхронизация между салоном и цехом)'),
          h('li', null, 'Централизованный прайс-лист плитных материалов EGGER/AGT и фурнитуры'),
          h('li', null, 'Оплата по безналичному расчёту для ИП и ТОО с закрывающими документами (ЭСФ / АВР)'),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d',
          style: 'width:100%; padding:11px;',
          onClick: () => openCheckoutModal(user, 'factory', onRefresh),
        },
        curPlan === 'factory' && isSubActive ? 'Продлить тариф «Фабрика» (39 900 ₸)' : 'Подключить «Мебельная Фабрика» — 39 900 ₸ →',
      ),
    ),
  );

  host.append(statusPanel, plansGrid);
}

// ——— ВКЛАДКА 4: РЕКВИЗИТЫ И ПРОФИЛЬ ———

function renderSettingsSection(host: HTMLElement, user: UserAccount, settings: Settings, onRefresh: () => void): void {
  const userNameInp = h('input', { class: 'inp-d', type: 'text', value: user.name || '' });
  const compNameInp = h('input', {
    class: 'inp-d',
    type: 'text',
    value: settings.company.name || user.company || '',
    placeholder: 'Например: ИП «ADAL Mebel»',
  });
  const compPhoneInp = h('input', {
    class: 'inp-d',
    type: 'text',
    value: settings.company.phone || '',
    placeholder: '+7 701 000 00 00',
  });
  const validDaysInp = h('input', {
    class: 'inp-d',
    type: 'number',
    value: String(settings.company.validDays || 7),
  });
  const noteInp = h('input', {
    class: 'inp-d',
    type: 'text',
    value: settings.company.note || '',
  });

  const profilePanel = h(
    'div',
    { class: 'panel-box' },
    h(
      'div',
      { class: 'panel-head' },
      h('span', { class: 'panel-head-title' }, 'Юридические реквизиты цеха (для Договоров подряда и КП)'),
    ),
    h(
      'div',
      { class: 'panel-body', style: 'display:flex; flex-direction:column; gap:16px;' },
      h(
        'div',
        { class: 'form-grid-2' },
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Наименование Исполнителя (ИП / ТОО / Фабрика)'),
          compNameInp,
          h('span', { class: 'fld-hint' }, 'Подставляется в шапку Договора бытового подряда и на фото-рендеры'),
        ),
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Контактный телефон цеха / отдела продаж'),
          compPhoneInp,
          h('span', { class: 'fld-hint' }, 'Указывается в КП для WhatsApp и реквизитах Исполнителя'),
        ),
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Контактное лицо / Руководитель'),
          userNameInp,
        ),
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Логин / Email аккаунта'),
          h('input', { class: 'inp-d', type: 'text', value: user.login, disabled: true }),
        ),
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Срок действия коммерческого предложения (дней)'),
          validDaysInp,
        ),
        h(
          'label',
          { class: 'fld-group' },
          h('span', { class: 'fld-label' }, 'Примечание в нижнем колонтитуле сметы'),
          noteInp,
        ),
      ),
      h(
        'div',
        null,
        h(
          'button',
          {
            type: 'button',
            class: 'btn-d primary',
            onClick: () => {
              const compTitle = compNameInp.value.trim() || 'Мебельный цех';
              updateAccountProfile(user.id, {
                name: userNameInp.value.trim() || user.login,
                company: compTitle,
              });
              const nextSettings = structuredClone(settings);
              nextSettings.company.name = compTitle;
              nextSettings.company.phone = compPhoneInp.value.trim();
              nextSettings.company.validDays = Number(validDaysInp.value) || 7;
              nextSettings.company.note = noteInp.value.trim();
              saveSettings(nextSettings);
              dashToast('Реквизиты ИП / ТОО и профиль успешно сохранены');
              onRefresh();
            },
          },
          icon('check', 14),
          'Сохранить реквизиты цеха',
        ),
      ),
    ),
  );

  // Смена пароля
  const newPassInp = h('input', {
    class: 'inp-d',
    type: 'password',
    placeholder: 'Новый пароль (минимум 6 символов)',
    style: 'max-width:320px;',
  });

  const securityPanel = h(
    'div',
    { class: 'panel-box' },
    h('div', { class: 'panel-head' }, h('span', { class: 'panel-head-title' }, 'Безопасность и пароль для входа')),
    h(
      'div',
      { class: 'panel-body', style: 'display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap;' },
      h('label', { class: 'fld-group' }, h('span', { class: 'fld-label' }, 'Установить новый пароль'), newPassInp),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-d',
          onClick: () => {
            if (newPassInp.value.trim().length < 6) {
              dashToast('Пароль должен содержать не менее 6 символов', 'err');
              return;
            }
            if (updateAccountPassword(user.id, newPassInp.value.trim())) {
              newPassInp.value = '';
              dashToast('Пароль успешно обновлён (SHA-256)');
            }
          },
        },
        'Обновить пароль',
      ),
    ),
  );

  host.append(profilePanel, securityPanel);
}

window.addEventListener('DOMContentLoaded', initDashboard);
