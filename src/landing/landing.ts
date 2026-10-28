import '@fontsource-variable/inter';
import '../styles/landing.css';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function initLandingInteractions() {
  // 1. AI Prompt Input & Quick Tags
  const aiInput = document.getElementById('hero-ai-input') as HTMLInputElement | null;
  const aiBtn = document.getElementById('hero-ai-btn');

  const submitPrompt = () => {
    if (!aiInput) return;
    const q = aiInput.value.trim();
    if (!q) {
      window.location.href = 'constructor.html';
      return;
    }
    window.location.href = `constructor.html?ai=${encodeURIComponent(q)}`;
  };

  if (aiBtn) {
    aiBtn.addEventListener('click', submitPrompt);
  }
  if (aiInput) {
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPrompt();
    });
  }

  const chips = document.querySelectorAll<HTMLButtonElement>('.prompt-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.prompt;
      if (p && aiInput) {
        aiInput.value = p;
        submitPrompt();
      }
    });
  });
}

function initHero3D() {
  const container = document.getElementById('hero-3d-canvas');
  if (!container) return;

  const scene = new Scene();
  scene.background = new Color('#0a0e1c');

  const camera = new PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 50);
  camera.position.set(2.5, 1.7, 3.1);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.enableZoom = false;
  controls.target.set(0, 0.95, 0);

  // Освещение
  const amb = new AmbientLight(0xffffff, 1.4);
  scene.add(amb);

  const mainDir = new DirectionalLight(0xffffff, 2.6);
  mainDir.position.set(4, 5, 3.5);
  scene.add(mainDir);

  const fillBlue = new DirectionalLight(0x818cf8, 1.8);
  fillBlue.position.set(-3, 2, -2);
  scene.add(fillBlue);

  // Внутренняя теплая LED-подсветка
  const warmLed = new PointLight(0xffecd2, 2.2, 2.5);
  warmLed.position.set(0, 1.3, 0.05);
  scene.add(warmLed);

  const cabinetGroup = new Group();
  scene.add(cabinetGroup);

  // Цветовые схемы
  const matColors: Record<string, { body: number; facade: number }> = {
    cashmere: { body: 0xb5afa6, facade: 0xc8c2b9 },
    graphite: { body: 0x1e2129, facade: 0x272b35 },
    wood: { body: 0xbfa27a, facade: 0xbfa27a },
    white: { body: 0xdedede, facade: 0xf4f6f8 },
  };

  const currentTheme = matColors.cashmere;
  const bodyMat = new MeshStandardMaterial({ color: currentTheme.body, roughness: 0.5, metalness: 0.05 });
  const facadeMat = new MeshStandardMaterial({ color: currentTheme.facade, roughness: 0.4, metalness: 0.05 });
  const woodInteriorMat = new MeshStandardMaterial({ color: 0xc49e6f, roughness: 0.65 });
  const metalMat = new MeshStandardMaterial({ color: 0x1f232b, metalness: 0.8, roughness: 0.2 });
  const handleMat = new MeshStandardMaterial({ color: 0x181a20, metalness: 0.9, roughness: 0.1 });
  const edgeMat = new LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.6 });

  const addBox = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: MeshStandardMaterial,
    parent: Group = cabinetGroup,
  ) => {
    const geo = new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    parent.add(edges);
    return mesh;
  };

  const W = 1.3, H = 2.1, D = 0.58, T = 0.018;

  // Корпус
  addBox(T, H, D, -W/2 + T/2, H/2, 0, bodyMat);
  addBox(T, H, D, W/2 - T/2, H/2, 0, bodyMat);
  addBox(W - 2*T, T, D, 0, T/2 + 0.08, 0, bodyMat);
  addBox(W - 2*T, T, D, 0, H - T/2, 0, bodyMat);
  addBox(W - T, H - T, 0.006, 0, H/2, -D/2 + 0.005, bodyMat);
  addBox(W - 2*T, 0.08, T, 0, 0.04, D/2 - 0.04, bodyMat);

  // Центральная перегородка
  const innerH = H - 0.08 - 2*T;
  addBox(T, innerH, D - 0.03, 0, 0.08 + T + innerH/2, -0.015, bodyMat);

  // Левая секция: 4 полки из натурального дерева
  const leftX = -W/4;
  for (let i = 1; i <= 4; i++) {
    const y = 0.08 + T + (i * innerH / 5);
    addBox(W/2 - T*1.5, T, D - 0.04, leftX, y, -0.015, woodInteriorMat);
  }

  // Правая секция: 2 ящика снизу + штанга для одежды
  const rightX = W/4;
  for (let i = 0; i < 2; i++) {
    const y = 0.08 + T + 0.11 + i * 0.22;
    addBox(W/2 - T*1.5, 0.2, D - 0.05, rightX, y, 0.01, woodInteriorMat);
    // Черная тонкая ручка на ящике
    addBox(0.16, 0.012, 0.02, rightX, y, D/2 - 0.03, handleMat);
  }

  // Металлическая штанга для плечиков
  addBox(W/2 - T*1.5, 0.022, 0.022, rightX, H - 0.26, -0.02, metalMat);

  // Створки дверей с петлями и возможностью открывания
  const leftDoorPivot = new Group();
  leftDoorPivot.position.set(-W/2, 0, D/2);
  cabinetGroup.add(leftDoorPivot);

  const rightDoorPivot = new Group();
  rightDoorPivot.position.set(W/2, 0, D/2);
  cabinetGroup.add(rightDoorPivot);

  const doorW = W/2 - 0.003;
  const doorH = H - 0.08 - 0.004;
  const doorY = 0.08 + doorH/2;

  // Левая дверь (pivot на левом ребре)
  addBox(doorW, doorH, T, doorW/2, doorY, T/2, facadeMat, leftDoorPivot);
  // Длинная вертикальная ручка-профиль на левой двери
  addBox(0.015, 0.6, 0.025, doorW - 0.04, doorY, T + 0.012, handleMat, leftDoorPivot);

  // Правая дверь (pivot на правом ребре)
  addBox(doorW, doorH, T, -doorW/2, doorY, T/2, facadeMat, rightDoorPivot);
  // Длинная вертикальная ручка-профиль на правой двери
  addBox(0.015, 0.6, 0.025, -doorW + 0.04, doorY, T + 0.012, handleMat, rightDoorPivot);

  // Анимация дверей
  let doorsOpen = false;
  let targetAngle = 0;
  let currentAngle = 0;

  const toggleDoorsBtn = document.getElementById('toggle-doors-btn');
  const toggleLabel = document.getElementById('doors-btn-label');

  if (toggleDoorsBtn) {
    toggleDoorsBtn.addEventListener('click', () => {
      doorsOpen = !doorsOpen;
      targetAngle = doorsOpen ? (105 * Math.PI / 180) : 0;
      if (toggleLabel) {
        toggleLabel.textContent = doorsOpen ? 'Закрыть двери' : 'Открыть двери';
      }
    });
  }

  // Переключение материалов
  const matPills = document.querySelectorAll<HTMLButtonElement>('.mat-pill');
  matPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      matPills.forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      const key = pill.dataset.mat ?? 'cashmere';
      const colors = matColors[key];
      if (colors) {
        facadeMat.color.setHex(colors.facade);
        bodyMat.color.setHex(colors.body);
      }
    });
  });

  function resize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  function animate() {
    requestAnimationFrame(animate);

    // Плавное открывание/закрывание створок
    currentAngle += (targetAngle - currentAngle) * 0.08;
    leftDoorPivot.rotation.y = -currentAngle;
    rightDoorPivot.rotation.y = currentAngle;

    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

window.addEventListener('DOMContentLoaded', () => {
  initLandingInteractions();
  initHero3D();
});
