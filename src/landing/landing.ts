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
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function initHero3D() {
  const container = document.getElementById('hero-3d-canvas');
  if (!container) return;

  const scene = new Scene();
  scene.background = new Color('#0c0f1d');

  const camera = new PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 50);
  camera.position.set(2.4, 1.8, 2.9);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.enableZoom = false;
  controls.target.set(0, 0.9, 0);

  // Освещение
  const amb = new AmbientLight(0xffffff, 1.2);
  scene.add(amb);

  const dirLight = new DirectionalLight(0xffffff, 2.8);
  dirLight.position.set(4, 5, 3);
  scene.add(dirLight);

  const blueLight = new DirectionalLight(0x6366f1, 2.0);
  blueLight.position.set(-3, 2, -2);
  scene.add(blueLight);

  // Построение стильного 3D-шкафа
  const cabinetGroup = new Group();
  scene.add(cabinetGroup);

  const bodyMat = new MeshStandardMaterial({ color: 0x222738, roughness: 0.4, metalness: 0.1 });
  const woodMat = new MeshStandardMaterial({ color: 0xc89d6c, roughness: 0.6 });
  const edgeMat = new LineBasicMaterial({ color: 0x475569 });

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: MeshStandardMaterial) => {
    const geo = new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    cabinetGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    cabinetGroup.add(edges);
    return mesh;
  };

  const W = 1.2, H = 2.0, D = 0.6, T = 0.02;

  // Боковины
  addBox(T, H, D, -W/2 + T/2, H/2, 0, bodyMat);
  addBox(T, H, D, W/2 - T/2, H/2, 0, bodyMat);
  // Дно и крышка
  addBox(W - 2*T, T, D, 0, T/2 + 0.08, 0, bodyMat);
  addBox(W - 2*T, T, D, 0, H - T/2, 0, bodyMat);
  // Задняя стенка
  addBox(W - T, H - T, 0.005, 0, H/2, -D/2 + 0.01, bodyMat);
  // Цоколь
  addBox(W - 2*T, 0.08, T, 0, 0.04, D/2 - 0.05, bodyMat);
  // Средняя перегородка
  addBox(T, H - 0.08 - 2*T, D - 0.02, 0, (H + 0.08)/2, 0, bodyMat);

  // Полки слева
  const leftX = -W/4;
  for (let i = 1; i <= 4; i++) {
    const y = 0.08 + (i * (H - 0.08) / 5);
    addBox(W/2 - T*1.5, T, D - 0.03, leftX, y, 0, woodMat);
  }

  // Ящики справа снизу
  const rightX = W/4;
  for (let i = 0; i < 2; i++) {
    const y = 0.12 + i * 0.22 + 0.1;
    addBox(W/2 - T*1.5, 0.2, D - 0.04, rightX, y, 0.01, woodMat);
  }
  // Штанга справа сверху
  addBox(W/2 - T*1.5, 0.025, 0.025, rightX, H - 0.25, 0, new MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 }));

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
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

window.addEventListener('DOMContentLoaded', initHero3D);
