import '@fontsource-variable/inter';
import '../styles/dashboard.css';
import {
  getCurrentUser,
  hasActiveSubscription,
  logoutCurrentUser,
  setAccountSubscription,
  handleAuthRedirectCallback,
  type UserAccount,
} from '../core/auth';
import { loadLibrary } from '../core/storage';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { Project } from '../core/types';

type Tab = 'projects' | 'subscription' | 'settings';

function initDashboard() {
  handleAuthRedirectCallback();

  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  let activeTab: Tab = 'projects';
  const app = document.getElementById('dash-app');
  if (!app) return;

  const render = () => {
    const curUser = getCurrentUser() || user;
    const isSubActive = hasActiveSubscription(curUser);
    const projects: Project[] = loadLibrary(DEFAULT_SETTINGS);

    app.innerHTML = `
      <div class="dash-layout">
        <!-- Боковое меню -->
        <aside class="dash-sidebar">
          <a href="index.html" class="dash-brand">
            <svg viewBox="0 0 32 32" width="24" height="24"><use href="favicon.svg#logo" /></svg>
            <span>ADAL Constructor</span>
          </a>

          <nav class="dash-nav">
            <button class="dash-nav-btn ${activeTab === 'projects' ? 'active' : ''}" data-tab="projects">
              📁 Мои проекты (${projects.length})
            </button>
            <button class="dash-nav-btn ${activeTab === 'subscription' ? 'active' : ''}" data-tab="subscription">
              💳 Тариф и подписка ${isSubActive ? '✓' : '⚠️'}
            </button>
            <button class="dash-nav-btn ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
              ⚙️ Настройки цеха
            </button>
          </nav>

          <div class="dash-user-card">
            <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Аккаунт</div>
            <div style="font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${curUser.name || curUser.login}</div>
            <div style="font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${curUser.login}</div>
            <button id="btn-logout" style="margin-top:6px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:6px; font-size:12px; font-weight:600; cursor:pointer;">
              Выйти из аккаунта
            </button>
          </div>
        </aside>

        <!-- Основная часть -->
        <main class="dash-main">
          <!-- Верхний баннер статуса подписки -->
          <div class="sub-banner ${isSubActive ? 'active' : 'locked'}">
            <div>
              <div style="font-weight:800; font-size:14px;">
                ${isSubActive ? '🎉 Подписка активна (PRO доступ)' : '🔒 Конструктор закрыт — требуется подписка'}
              </div>
              <div style="font-size:12.5px; opacity:0.9; margin-top:2px;">
                ${isSubActive 
                  ? 'Вам доступны все возможности: 3D-проектирование, раскрой, присадка и смета.' 
                  : 'Выберите подходящий тариф ниже, чтобы открыть конструктор и проектировать мебель.'}
              </div>
            </div>
            ${isSubActive 
              ? `<a href="constructor.html" class="btn-open-cad">Открыть 3D-Конструктор →</a>` 
              : `<button class="btn-open-cad locked" id="btn-unlock-cad">Разблокировать конструктор</button>`}
          </div>

          <!-- Контент вкладок -->
          <div id="tab-content"></div>
        </main>
      </div>
    `;

    // Обработчики навигации
    app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.dataset.tab as Tab;
        render();
      };
    });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        logoutCurrentUser();
        window.location.href = 'index.html';
      };
    }

    const unlockBtn = document.getElementById('btn-unlock-cad');
    if (unlockBtn) {
      unlockBtn.onclick = () => {
        activeTab = 'subscription';
        render();
      };
    }

    const tabHost = document.getElementById('tab-content');
    if (!tabHost) return;

    if (activeTab === 'projects') {
      renderProjectsTab(tabHost, projects, isSubActive);
    } else if (activeTab === 'subscription') {
      renderSubscriptionTab(tabHost, curUser, isSubActive, () => render());
    } else if (activeTab === 'settings') {
      renderSettingsTab(tabHost, curUser);
    }
  };

  render();
}

function renderProjectsTab(host: HTMLElement, projects: Project[], isSubActive: boolean) {
  host.innerHTML = `
    <div class="dash-header">
      <div>
        <h1>Мои сохранённые проекты</h1>
        <div style="font-size:13.5px; color:#64748b; margin-top:4px;">
          Все ваши кухни и шкафы, созданные в конструкторе
        </div>
      </div>
      <div>
        ${isSubActive 
          ? `<a href="constructor.html?new=1" class="btn-open-cad">+ Создать новый проект</a>`
          : `<button class="btn-open-cad locked" onclick="alert('Для создания новых проектов активируйте подписку')">+ Создать новый проект</button>`}
      </div>
    </div>

    ${projects.length === 0 ? `
      <div class="dash-card" style="text-align:center; padding:48px 20px;">
        <div style="font-size:40px; margin-bottom:12px;">📐</div>
        <div style="font-weight:700; font-size:16px;">У вас пока нет сохранённых проектов</div>
        <div style="font-size:13.5px; color:#64748b; margin:6px 0 20px;">
          Откройте 3D-конструктор, чтобы спроектировать первую кухню или шкаф.
        </div>
        ${isSubActive 
          ? `<a href="constructor.html" class="btn-open-cad">Перейти в 3D-Конструктор</a>`
          : `<button class="btn-open-cad" style="background:#2563eb;" onclick="document.querySelector('[data-tab=subscription]').click()">Оформить доступ</button>`}
      </div>
    ` : `
      <div class="projects-grid">
        ${projects.map((p) => `
          <div class="proj-card">
            <div style="font-weight:700; font-size:15px; color:#0f172a;">${p.name}</div>
            <div style="font-size:12.5px; color:#64748b;">
              Модулей: ${p.modules.length} шт · Обновлён: ${new Date(p.updatedAt).toLocaleDateString()}
            </div>
            ${p.clientName ? `<div style="font-size:12px; color:#2563eb;">Клиент: ${p.clientName}</div>` : ''}
            <div style="display:flex; gap:8px; margin-top:8px;">
              ${isSubActive 
                ? `<a href="constructor.html#v=${p.id}" style="flex:1; text-align:center; padding:8px; border-radius:6px; background:#2563eb; color:#fff; text-decoration:none; font-size:12.5px; font-weight:700;">Открыть в 3D</a>`
                : `<button style="flex:1; padding:8px; border-radius:6px; background:#64748b; color:#fff; border:0; font-size:12.5px; font-weight:700;" onclick="alert('Активируйте подписку для редактирования')">Заблокировано</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function renderSubscriptionTab(host: HTMLElement, user: UserAccount, isSubActive: boolean, onUpdate: () => void) {
  host.innerHTML = `
    <div class="dash-header">
      <div>
        <h1>Тарифы и подписка</h1>
        <div style="font-size:13.5px; color:#64748b; margin-top:4px;">
          Выберите тариф для полного доступа к конструктору, картам раскроя и базе проектов
        </div>
      </div>
    </div>

    <div class="tariff-grid">
      <!-- Цех Pro -->
      <div class="tariff-card featured">
        <div style="font-size:11px; font-weight:800; color:#2563eb; text-transform:uppercase; margin-bottom:4px;">Популярный для цехов</div>
        <div style="font-size:20px; font-weight:800;">Цех Pro</div>
        <div style="font-size:32px; font-weight:800; margin:10px 0;">14 900 ₸ <span style="font-size:14px; color:#64748b; font-weight:500;">/ месяц</span></div>
        <div style="font-size:13px; color:#64748b; margin-bottom:16px;">Идеально для индивидуальных мастеров и производств.</div>
        
        <ul style="list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:8px; font-size:13px; flex:1;">
          <li>✓ Безлимитные 3D проекты кухонь и шкафов</li>
          <li>✓ Автоматические карты раскроя листов 2800×2070</li>
          <li>✓ Печать бирок со штрихкодами для цеха</li>
          <li>✓ Расчёт сметы, КП в WhatsApp и Договор подряда</li>
        </ul>

        <button id="buy-pro-btn" style="width:100%; padding:12px; border-radius:8px; border:0; background:#2563eb; color:#fff; font-weight:700; cursor:pointer;">
          ${user.subscription === 'pro' && isSubActive ? 'Тариф активен (Продлить)' : 'Оплатить 14 900 ₸ (Kaspi QR / Карта)'}
        </button>
      </div>

      <!-- Фабрика -->
      <div class="tariff-card">
        <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:4px;">Для фабрик и салонов</div>
        <div style="font-size:20px; font-weight:800;">Мебельная Фабрика</div>
        <div style="font-size:32px; font-weight:800; margin:10px 0;">39 900 ₸ <span style="font-size:14px; color:#64748b; font-weight:500;">/ месяц</span></div>
        <div style="font-size:13px; color:#64748b; margin-bottom:16px;">Для команд: несколько замерщиков, дизайнеры и цех.</div>
        
        <ul style="list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:8px; font-size:13px; flex:1;">
          <li>✓ До 10 аккаунтов сотрудников</li>
          <li>✓ Единая облачная база заказов (PostgreSQL / Supabase)</li>
          <li>✓ Настройка своих прайсов на материалы и работы</li>
          <li>✓ Приоритетная поддержка и внедрение в цех</li>
        </ul>

        <button id="buy-factory-btn" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#0f172a; font-weight:700; cursor:pointer;">
          ${user.subscription === 'factory' && isSubActive ? 'Тариф активен (Продлить)' : 'Подключить Фабрику (39 900 ₸)'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('buy-pro-btn')?.addEventListener('click', () => {
    setAccountSubscription(user.id, 'pro');
    alert('Оплата прошла успешно! Тариф "Цех Pro" активирован на 30 дней. Теперь 3D-конструктор разблокирован.');
    onUpdate();
  });

  document.getElementById('buy-factory-btn')?.addEventListener('click', () => {
    setAccountSubscription(user.id, 'factory');
    alert('Оплата прошла успешно! Тариф "Мебельная Фабрика" активирован на 30 дней.');
    onUpdate();
  });
}

function renderSettingsTab(host: HTMLElement, user: UserAccount) {
  host.innerHTML = `
    <div class="dash-header">
      <div>
        <h1>Настройки профиля и цеха</h1>
        <div style="font-size:13.5px; color:#64748b; margin-top:4px;">
          Эти данные будут отображаться в Договорах и Коммерческих предложениях (КП)
        </div>
      </div>
    </div>

    <div class="dash-card" style="max-width:600px;">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:6px;">Ваше имя</label>
          <input type="text" id="set-name" value="${user.name || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:6px;">Название цеха / ИП / ТОО</label>
          <input type="text" id="set-comp" value="${user.company || ''}" placeholder="Например: ИП МебельМастер" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:6px;">Email / Логин (для входа)</label>
          <input type="text" value="${user.login}" disabled style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0; background:#f1f5f9; color:#64748b; box-sizing:border-box;">
        </div>
        <button id="save-settings-btn" style="padding:10px 16px; border-radius:8px; border:0; background:#2563eb; color:#fff; font-weight:700; cursor:pointer; align-self:flex-start;">
          Сохранить изменения
        </button>
      </div>
    </div>
  `;

  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    const name = (document.getElementById('set-name') as HTMLInputElement).value;
    const comp = (document.getElementById('set-comp') as HTMLInputElement).value;
    user.name = name;
    user.company = comp;
    alert('Настройки успешно сохранены!');
  });
}

window.addEventListener('DOMContentLoaded', initDashboard);
