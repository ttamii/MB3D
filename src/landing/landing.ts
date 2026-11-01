import '@fontsource-variable/inter';
import '../styles/landing.css';
import {
  getCurrentUser,
  hasActiveSubscription,
  logoutCurrentUser,
} from '../core/auth';
import { generateKitchenLayout } from '../core/kitchenWizard';
import { DEFAULT_SETTINGS, PRESETS } from '../core/defaults';
import { DEFAULT_ROOM } from '../core/room';
import type { Module } from '../core/types';
import { Viewer } from '../three/viewer';
import { showAuthGateModal } from '../ui/dialogs';

function buildShowcaseKitchen(): Module[] {
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
    if (m.kind === 'tall' && m.x === 0) {
      m.hinge = 'left';
    }
  }
  return mods;
}

function buildShowcaseWardrobe(): Module[] {
  const preset = PRESETS.find((p) => p.id === 'wardrobe-hinged') ?? PRESETS[0];
  const m = preset.make();
  m.x = 200;
  m.w = 1800;
  m.h = 2400;
  m.d = 580;
  m.plinth = 80;
  m.topTrim = 60;
  m.matFacade = 'eg-u702';
  m.matCorpus = 'eg-w1000';
  m.plinthColor = 'facade';
  return [m];
}

function initAuthControls(): void {
  const headerArea = document.getElementById('header-auth-area');
  const heroBanner = document.getElementById('hero-account-banner');
  const heroEnterBtn = document.getElementById('hero-enter-btn');
  const heroRegBtn = document.getElementById('hero-reg-btn');

  const goToConstructor = () => {
    const user = getCurrentUser();
    if (user && hasActiveSubscription(user)) {
      window.location.href = 'constructor.html';
      return;
    }
    showAuthGateModal(() => {
      window.location.href = 'constructor.html';
    });
  };

  const refreshAuthUI = () => {
    const user = getCurrentUser();
    const subOk = hasActiveSubscription(user);

    if (headerArea) {
      headerArea.innerHTML = '';
      if (user) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:12.5px; font-weight:600; color:#334155; padding:6px 10px; background:#f1f5f9; border-radius:8px;';
        badge.textContent = `${user.name} · ${subOk ? 'Подписка активна' : 'Нет подписки'}`;

        const enterBtn = document.createElement('button');
        enterBtn.type = 'button';
        enterBtn.className = 'btn btn-primary';
        enterBtn.textContent = subOk ? 'В конструктор →' : 'Оформить подписку';
        enterBtn.onclick = goToConstructor;

        const outBtn = document.createElement('button');
        outBtn.type = 'button';
        outBtn.className = 'btn btn-outline';
        outBtn.textContent = 'Выйти';
        outBtn.onclick = () => {
          logoutCurrentUser();
          refreshAuthUI();
        };

        headerArea.append(badge, enterBtn, outBtn);
      } else {
        const loginBtn = document.createElement('button');
        loginBtn.type = 'button';
        loginBtn.className = 'btn btn-outline';
        loginBtn.textContent = 'Войти';
        loginBtn.onclick = () => showAuthGateModal(() => refreshAuthUI(), 'login');

        const regBtn = document.createElement('button');
        regBtn.type = 'button';
        regBtn.className = 'btn btn-outline';
        regBtn.textContent = 'Регистрация';
        regBtn.onclick = () => showAuthGateModal(() => refreshAuthUI(), 'register');

        const enterBtn = document.createElement('button');
        enterBtn.type = 'button';
        enterBtn.className = 'btn btn-primary';
        enterBtn.textContent = 'Открыть конструктор';
        enterBtn.onclick = goToConstructor;

        headerArea.append(loginBtn, regBtn, enterBtn);
      }
    }

    if (heroBanner) {
      if (user) {
        heroBanner.innerHTML = subOk
          ? `Вы вошли как <b>${user.name} (${user.login})</b> · <span style="color:#059669;font-weight:700;">Подписка активна — доступ открыт</span>`
          : `Вы вошли как <b>${user.name} (${user.login})</b> · <span style="color:#dc2626;font-weight:700;">Подписка не активна — оформите тариф для входа в конструктор</span>`;
      } else {
        heroBanner.innerHTML = `Для работы в конструкторе требуется вход в аккаунт и активная подписка.`;
      }
    }

    if (heroRegBtn) {
      if (user && !subOk) {
        heroRegBtn.textContent = 'Активировать подписку';
        heroRegBtn.onclick = () => showAuthGateModal(() => refreshAuthUI(), 'paywall');
      } else if (user && subOk) {
        heroRegBtn.textContent = 'Сменить аккаунт';
        heroRegBtn.onclick = () => {
          logoutCurrentUser();
          showAuthGateModal(() => refreshAuthUI(), 'login');
        };
      } else {
        heroRegBtn.textContent = 'Создать аккаунт';
        heroRegBtn.onclick = () => showAuthGateModal(() => refreshAuthUI(), 'register');
      }
    }
  };

  if (heroEnterBtn) {
    heroEnterBtn.addEventListener('click', goToConstructor);
  }

  document.querySelectorAll<HTMLButtonElement>('[data-subscribe]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = getCurrentUser();
      showAuthGateModal(() => {
        refreshAuthUI();
        window.location.href = 'constructor.html';
      }, user ? 'paywall' : 'register');
    });
  });

  refreshAuthUI();
}

function initHero3D(): void {
  const container = document.getElementById('hero-3d-canvas');
  if (!container) return;

  let viewer: Viewer;
  try {
    viewer = new Viewer(container, () => DEFAULT_SETTINGS.materials);
  } catch {
    container.innerHTML = '<p style="padding:2rem;text-align:center;">Ваш браузер не поддерживает 3D WebGL.</p>';
    return;
  }

  const kitchenRoom = {
    ...DEFAULT_ROOM,
    w: 2600,
    d: 2000,
    h: 2590,
    windows: [],
    doors: [],
  };

  const wardrobeRoom = {
    ...DEFAULT_ROOM,
    w: 2200,
    d: 1800,
    h: 2550,
    windows: [],
    doors: [],
  };

  viewer.updateRoom(kitchenRoom);
  viewer.update(buildShowcaseKitchen());
  viewer.frame('iso', false);

  const toggleDoorsBtn = document.getElementById('toggle-doors-btn');
  const toggleLabel = document.getElementById('doors-btn-label');
  const toggleXrayBtn = document.getElementById('toggle-xray-btn');

  viewer.onAnimChange = () => {
    if (toggleLabel) {
      toggleLabel.textContent = viewer.isOpen() ? 'Закрыть фасады' : 'Открыть фасады';
    }
  };

  if (toggleDoorsBtn) {
    toggleDoorsBtn.addEventListener('click', () => {
      viewer.setOpen(!viewer.isOpen());
    });
  }

  if (toggleXrayBtn) {
    toggleXrayBtn.addEventListener('click', () => {
      const on = viewer.toggleXray();
      toggleXrayBtn.textContent = on ? 'Обычный вид' : 'Рентген';
    });
  }

  const modelPills = document.querySelectorAll<HTMLButtonElement>('.model-pill');
  modelPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      modelPills.forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      const isWardrobe = pill.dataset.model === 'wardrobe';
      viewer.setOpen(false);
      if (isWardrobe) {
        viewer.updateRoom(wardrobeRoom);
        viewer.update(buildShowcaseWardrobe());
      } else {
        viewer.updateRoom(kitchenRoom);
        viewer.update(buildShowcaseKitchen());
      }
      viewer.frame('iso', true);
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initAuthControls();
  initHero3D();
});
