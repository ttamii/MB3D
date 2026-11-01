import '@fontsource-variable/inter';
import '../styles/landing.css';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function initLandingInteractions() {
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
  scene.background = new Color('#f1f5f9');

  const camera = new PerspectiveCamera(34, container.clientWidth / container.clientHeight, 0.1, 40);
  camera.position.set(2.45, 1.72, 3.35);

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.minDistance = 1.8;
  controls.maxDistance = 5.5;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.12, 0);

  // Мягкое студийное освещение
  scene.add(new AmbientLight(0xffffff, 1.75));
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(4, 6, 4.5);
  scene.add(sun);
  const fill = new DirectionalLight(0xe0f2fe, 0.9);
  fill.position.set(-3.5, 2.5, 2);
  scene.add(fill);

  // Студийный подиум
  const floorMat = new MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 });
  const floor = new Mesh(new BoxGeometry(4.2, 0.02, 2.2), floorMat);
  floor.position.set(0, -0.01, 0.15);
  scene.add(floor);

  const matColors: Record<string, { body: number; facade: number; top: number }> = {
    cashmere: { body: 0xfaf9f5, facade: 0xc8beaf, top: 0xedebe6 },
    white: { body: 0xffffff, facade: 0xf8fafc, top: 0xd8d5ce },
    wood: { body: 0xf4f3ef, facade: 0xb58a5c, top: 0x303135 },
    graphite: { body: 0x2d3036, facade: 0x434750, top: 0xb8905f },
  };

  const bodyMat = new MeshStandardMaterial({ color: matColors.cashmere.body, roughness: 0.55 });
  const facadeMat = new MeshStandardMaterial({ color: matColors.cashmere.facade, roughness: 0.42 });
  const topMat = new MeshStandardMaterial({ color: matColors.cashmere.top, roughness: 0.35 });
  const blackMat = new MeshStandardMaterial({ color: 0x18191c, roughness: 0.25, metalness: 0.3 });
  const metalMat = new MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 });
  const handleMat = new MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 });
  const edgeMat = new LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.38 });

  const rootGroup = new Group();
  scene.add(rootGroup);

  interface AnimDoor {
    pivot: Group;
    axis: 'y' | 'x';
    maxRad: number;
  }
  let animDoors: AnimDoor[] = [];
  let activeModel: 'kitchen' | 'wardrobe' = 'kitchen';

  const addBox = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: MeshStandardMaterial,
    parent: Group,
    withEdges = true,
  ) => {
    const geo = new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    if (withEdges) {
      const edges = new LineSegments(new EdgesGeometry(geo), edgeMat);
      edges.position.copy(mesh.position);
      parent.add(edges);
    }
    return mesh;
  };

  const buildKitchenScene = () => {
    rootGroup.clear();
    animDoors = [];
    // Общая ширина гарнитура 2.4м (центрирована от -1.2 до +1.2)
    // Слева пенал 0.6м (-1.2 .. -0.6), Мойка 0.6м (-0.6 .. 0), Ящики 0.6м (0 .. 0.6), Духовка 0.6м (0.6 .. 1.2)
    const H_PLINTH = 0.1;
    const H_BASE = 0.72;
    const H_TOP = 0.038;
    const Y_WALL = 1.42;
    const H_WALL = 0.68;
    const Y_MEZZ = 2.1;
    const H_MEZZ = 0.34;
    const H_TRIM = 0.06;
    const D_BASE = 0.56;
    const D_WALL = 0.32;

    // 1. Цельный нижний цоколь на всю длину 2.4м + регулируемые ножки
    addBox(2.4, H_PLINTH, 0.016, 0, H_PLINTH / 2, D_BASE / 2 - 0.05, facadeMat, rootGroup);
    for (let i = 0; i < 5; i++) {
      const lx = -1.1 + i * 0.55;
      const legGeo = new CylinderGeometry(0.016, 0.016, H_PLINTH, 16);
      const leg = new Mesh(legGeo, blackMat);
      leg.position.set(lx, H_PLINTH / 2, D_BASE / 2 - 0.09);
      rootGroup.add(leg);
    }

    // 2. Пенал слева (-1.2 .. -0.6), высота до 2.44м
    const H_TALL_BODY = Y_MEZZ + H_MEZZ - H_PLINTH;
    addBox(0.6, H_TALL_BODY, D_BASE, -0.9, H_PLINTH + H_TALL_BODY / 2, 0, bodyMat, rootGroup);
    // Нижний ящик пенала
    addBox(0.594, 0.34, 0.016, -0.9, H_PLINTH + 0.17, D_BASE / 2 + 0.008, facadeMat, rootGroup);
    addBox(0.18, 0.012, 0.02, -0.9, H_PLINTH + 0.28, D_BASE / 2 + 0.02, handleMat, rootGroup);
    // Распашная дверь пенала (открывается вправо от левой стены)
    const tallDoorPivot = new Group();
    tallDoorPivot.position.set(-0.603, H_PLINTH + 0.35, D_BASE / 2);
    rootGroup.add(tallDoorPivot);
    const tallDoorH = H_TALL_BODY - 0.355;
    addBox(0.594, tallDoorH, 0.016, -0.297, tallDoorH / 2, 0.008, facadeMat, tallDoorPivot);
    addBox(0.012, 0.26, 0.02, -0.55, tallDoorH * 0.35, 0.02, handleMat, tallDoorPivot);
    animDoors.push({ pivot: tallDoorPivot, axis: 'y', maxRad: 1.4 });

    // 3. Корпуса нижних тумб (-0.6 .. +1.2, ширина 1.8м)
    addBox(1.8, H_BASE, D_BASE, 0.3, H_PLINTH + H_BASE / 2, 0, bodyMat, rootGroup);
    // Цельная столешница 1.8м × 38мм
    const yCounter = H_PLINTH + H_BASE + H_TOP / 2;
    addBox(1.8, H_TOP, D_BASE + 0.03, 0.3, yCounter, 0.015, topMat, rootGroup);

    // Тумба 1: Мойка 2 двери (-0.6 .. 0) + врезная чаша мойки и смеситель
    addBox(0.46, 0.004, 0.4, -0.3, yCounter + H_TOP / 2 + 0.002, 0.02, metalMat, rootGroup, false);
    addBox(0.4, 0.005, 0.32, -0.3, yCounter + H_TOP / 2 + 0.003, 0.04, blackMat, rootGroup, false);
    addBox(0.02, 0.16, 0.02, -0.3, yCounter + H_TOP / 2 + 0.08, -0.14, metalMat, rootGroup, false);
    addBox(0.02, 0.02, 0.11, -0.3, yCounter + H_TOP / 2 + 0.15, -0.09, metalMat, rootGroup, false);

    const sinkL = new Group();
    sinkL.position.set(-0.597, H_PLINTH, D_BASE / 2);
    rootGroup.add(sinkL);
    addBox(0.294, H_BASE - 0.006, 0.016, 0.147, H_BASE / 2, 0.008, facadeMat, sinkL);
    addBox(0.012, 0.16, 0.02, 0.26, H_BASE - 0.12, 0.02, handleMat, sinkL);
    animDoors.push({ pivot: sinkL, axis: 'y', maxRad: -1.4 });

    const sinkR = new Group();
    sinkR.position.set(-0.003, H_PLINTH, D_BASE / 2);
    rootGroup.add(sinkR);
    addBox(0.294, H_BASE - 0.006, 0.016, -0.147, H_BASE / 2, 0.008, facadeMat, sinkR);
    addBox(0.012, 0.16, 0.02, -0.26, H_BASE - 0.12, 0.02, handleMat, sinkR);
    animDoors.push({ pivot: sinkR, axis: 'y', maxRad: 1.4 });

    // Тумба 2: 3 выдвижных ящика (0 .. 0.6)
    const drH = (H_BASE - 0.012) / 3;
    for (let k = 0; k < 3; k++) {
      const dy = H_PLINTH + 0.003 + k * (drH + 0.003) + drH / 2;
      addBox(0.594, drH, 0.016, 0.3, dy, D_BASE / 2 + 0.008, facadeMat, rootGroup);
      addBox(0.18, 0.012, 0.02, 0.3, dy + drH * 0.25, D_BASE / 2 + 0.02, handleMat, rootGroup);
    }

    // Тумба 3: Духовой шкаф + варочная поверхность (0.6 .. 1.2)
    addBox(0.594, 0.15, 0.016, 0.9, H_PLINTH + 0.078, D_BASE / 2 + 0.008, facadeMat, rootGroup);
    addBox(0.56, 0.46, 0.02, 0.9, H_PLINTH + 0.39, D_BASE / 2 + 0.004, blackMat, rootGroup);
    addBox(0.56, 0.08, 0.022, 0.9, H_PLINTH + 0.66, D_BASE / 2 + 0.005, metalMat, rootGroup);
    addBox(0.44, 0.014, 0.025, 0.9, H_PLINTH + 0.59, D_BASE / 2 + 0.022, handleMat, rootGroup, false);
    // Индукционная панель сверху
    addBox(0.5, 0.004, 0.42, 0.9, yCounter + H_TOP / 2 + 0.002, 0.02, blackMat, rootGroup, false);

    // 4. Верхние шкафы (2-й ярус: Y = 1.42 .. 2.10, глубина 0.32)
    const zWallOffset = -D_BASE / 2 + D_WALL / 2;
    addBox(1.8, H_WALL, D_WALL, 0.3, Y_WALL + H_WALL / 2, zWallOffset, bodyMat, rootGroup);
    for (let u = 0; u < 3; u++) {
      const ux0 = -0.6 + u * 0.6;
      const uPivot = new Group();
      uPivot.position.set(ux0 + 0.003, Y_WALL, zWallOffset + D_WALL / 2);
      rootGroup.add(uPivot);
      addBox(0.594, H_WALL - 0.006, 0.016, 0.297, H_WALL / 2, 0.008, facadeMat, uPivot);
      addBox(0.012, 0.16, 0.02, 0.55, 0.12, 0.02, handleMat, uPivot);
      animDoors.push({ pivot: uPivot, axis: 'y', maxRad: -1.35 });
    }

    // 5. Антресоли на газлифтах вверх (3-й ярус: Y = 2.10 .. 2.44, глубина 0.56)
    addBox(1.8, H_MEZZ, D_BASE, 0.3, Y_MEZZ + H_MEZZ / 2, 0, bodyMat, rootGroup);
    for (let a = 0; a < 3; a++) {
      const axCenter = -0.3 + a * 0.6;
      const flapPivot = new Group();
      flapPivot.position.set(axCenter, Y_MEZZ + H_MEZZ, D_BASE / 2);
      rootGroup.add(flapPivot);
      addBox(0.594, H_MEZZ - 0.006, 0.016, 0, -H_MEZZ / 2, 0.008, facadeMat, flapPivot);
      animDoors.push({ pivot: flapPivot, axis: 'x', maxRad: -1.38 });
    }

    // 6. Цельная верхняя доборная планка (карниз 60 мм) на всю длину 2.4м
    addBox(2.4, H_TRIM, 0.016, 0, Y_MEZZ + H_MEZZ + H_TRIM / 2, D_BASE / 2 + 0.008, facadeMat, rootGroup);
  };

  const buildWardrobeScene = () => {
    rootGroup.clear();
    animDoors = [];
    const W = 1.5, H = 2.25, D = 0.58, T = 0.018, P = 0.08, TRIM = 0.06;

    // Корпус и цельный цоколь + верхний карниз
    addBox(T, H - P, D, -W / 2 + T / 2, P + (H - P) / 2, 0, bodyMat, rootGroup);
    addBox(T, H - P, D, W / 2 - T / 2, P + (H - P) / 2, 0, bodyMat, rootGroup);
    addBox(W - 2 * T, T, D, 0, P + T / 2, 0, bodyMat, rootGroup);
    addBox(W - 2 * T, T, D, 0, H - T / 2, 0, bodyMat, rootGroup);
    addBox(W - T, H - P - T, 0.006, 0, P + (H - P) / 2, -D / 2 + 0.005, bodyMat, rootGroup);
    addBox(W, P, 0.016, 0, P / 2, D / 2 - 0.04, facadeMat, rootGroup);
    addBox(W, TRIM, 0.016, 0, H + TRIM / 2, D / 2 + 0.008, facadeMat, rootGroup);

    const innerH = H - P - 2 * T;
    addBox(T, innerH, D - 0.03, 0, P + T + innerH / 2, -0.015, bodyMat, rootGroup);

    // Полки слева
    for (let i = 1; i <= 4; i++) {
      const y = P + T + (i * innerH) / 5;
      addBox(W / 2 - T * 1.5, T, D - 0.04, -W / 4, y, -0.015, bodyMat, rootGroup);
    }

    // Ящики и штанга справа
    for (let i = 0; i < 2; i++) {
      const y = P + T + 0.12 + i * 0.23;
      addBox(W / 2 - T * 1.5, 0.2, D - 0.05, W / 4, y, 0.01, bodyMat, rootGroup);
      addBox(0.18, 0.012, 0.02, W / 4, y, D / 2 - 0.03, handleMat, rootGroup);
    }
    addBox(W / 2 - T * 1.5, 0.022, 0.022, W / 4, H - 0.28, -0.02, metalMat, rootGroup);

    const doorW = W / 2 - 0.003;
    const doorH = H - P - 0.004;
    const doorY = P + doorH / 2;

    const leftDoorPivot = new Group();
    leftDoorPivot.position.set(-W / 2, 0, D / 2);
    rootGroup.add(leftDoorPivot);
    addBox(doorW, doorH, T, doorW / 2, doorY, T / 2, facadeMat, leftDoorPivot);
    addBox(0.015, 0.65, 0.025, doorW - 0.04, doorY, T + 0.012, handleMat, leftDoorPivot);
    animDoors.push({ pivot: leftDoorPivot, axis: 'y', maxRad: -1.45 });

    const rightDoorPivot = new Group();
    rightDoorPivot.position.set(W / 2, 0, D / 2);
    rootGroup.add(rightDoorPivot);
    addBox(doorW, doorH, T, -doorW / 2, doorY, T / 2, facadeMat, rightDoorPivot);
    addBox(0.015, 0.65, 0.025, -doorW + 0.04, doorY, T + 0.012, handleMat, rightDoorPivot);
    animDoors.push({ pivot: rightDoorPivot, axis: 'y', maxRad: 1.45 });
  };

  buildKitchenScene();

  // Анимация по требованию (0% нагрузки на видеокарту в покое!)
  let doorsOpen = false;
  let targetT = 0;
  let currentT = 0;
  let rafId = 0;

  const scheduleRender = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(tick);
  };

  const tick = () => {
    rafId = 0;
    const diff = targetT - currentT;
    let needsMore = false;
    if (Math.abs(diff) > 0.002) {
      currentT += diff * 0.12;
      needsMore = true;
    } else {
      currentT = targetT;
    }

    for (const d of animDoors) {
      if (d.axis === 'y') d.pivot.rotation.y = d.maxRad * currentT;
      else d.pivot.rotation.x = d.maxRad * currentT;
    }

    if (controls.update()) {
      needsMore = true;
    }

    renderer.render(scene, camera);
    if (needsMore) scheduleRender();
  };

  controls.addEventListener('change', scheduleRender);

  const toggleDoorsBtn = document.getElementById('toggle-doors-btn');
  const toggleLabel = document.getElementById('doors-btn-label');

  if (toggleDoorsBtn) {
    toggleDoorsBtn.addEventListener('click', () => {
      doorsOpen = !doorsOpen;
      targetT = doorsOpen ? 1 : 0;
      if (toggleLabel) {
        toggleLabel.textContent = doorsOpen ? 'Закрыть фасады' : 'Открыть фасады';
      }
      scheduleRender();
    });
  }

  const modelPills = document.querySelectorAll<HTMLButtonElement>('.model-pill');
  modelPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      modelPills.forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      const nextModel = pill.dataset.model === 'wardrobe' ? 'wardrobe' : 'kitchen';
      if (nextModel !== activeModel) {
        activeModel = nextModel;
        doorsOpen = false;
        targetT = 0;
        currentT = 0;
        if (toggleLabel) toggleLabel.textContent = 'Открыть фасады';
        if (activeModel === 'kitchen') {
          buildKitchenScene();
          camera.position.set(2.45, 1.72, 3.35);
        } else {
          buildWardrobeScene();
          camera.position.set(2.1, 1.65, 2.95);
        }
        controls.update();
        scheduleRender();
      }
    });
  });

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
        topMat.color.setHex(colors.top);
        scheduleRender();
      }
    });
  });

  window.addEventListener('resize', () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    scheduleRender();
  });

  scheduleRender();
}

window.addEventListener('DOMContentLoaded', () => {
  initLandingInteractions();
  initHero3D();
});
