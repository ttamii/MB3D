import {
  ACESFilmicToneMapping, AmbientLight, Box3, Box3Helper, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight,
  EdgesGeometry, Group, HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, MathUtils, PCFSoftShadowMap,
  PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Raycaster, Scene, Sprite, SpriteMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildModule } from '../core/geometry';
import type { RoomConfig } from '../core/room';
import type { Material, Module, Part, PartAnim } from '../core/types';
import { grainTexture, stoneTexture } from './textures';

export type ViewName = 'front' | 'iso' | 'top' | 'side';

const MM = 0.001;
const TEX_SCALE = 0.8;

function boxGeo(sx: number, sy: number, sz: number): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * dims[f][0]) / TEX_SCALE, (uv.getY(idx) * dims[f][1]) / TEX_SCALE);
    }
  }
  uv.needsUpdate = true;
  return g;
}

function partGeo(p: Part, off: [number, number, number]): BufferGeometry {
  const [sx, sy, sz] = p.size.map((v) => v * MM) as [number, number, number];
  let g: BufferGeometry;
  if (p.shape === 'cyl') {
    g = new CylinderGeometry(sy / 2, sy / 2, sx, 16);
    g.rotateZ(Math.PI / 2);
  } else g = boxGeo(sx, sy, sz);
  g.translate(
    (p.pos[0] + p.size[0] / 2) * MM - off[0],
    (p.pos[1] + p.size[1] / 2) * MM - off[1],
    (p.pos[2] + p.size[2] / 2) * MM - off[2],
  );
  return g;
}

function makeTextSprite(text: string, color = '#2563eb'): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 8);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new Sprite(mat);
  sp.scale.set(0.28, 0.07, 1);
  sp.renderOrder = 999;
  return sp;
}

function createDimLines(segments: [Vector3, Vector3][], color = 0x2563eb): LineSegments {
  const points: Vector3[] = [];
  for (const [a, b] of segments) {
    points.push(a, b);
  }
  const geo = new BufferGeometry().setFromPoints(points);
  const mat = new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });
  const lines = new LineSegments(geo, mat);
  lines.renderOrder = 998;
  return lines;
}

interface AnimRef {
  group: Group;
  anim: PartAnim;
  t: number;
  target: number;
}

export class Viewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.05, 80);
  private controls: OrbitControls;
  private modules = new Group();
  private roomGroup = new Group();
  private roomMats: MeshStandardMaterial[] = [];
  private floor: Mesh;
  private wall: Mesh;
  private sun: DirectionalLight;
  private helper: Box3Helper | null = null;
  private pickables: Mesh[] = [];
  private lines: LineSegments[] = [];
  private anims: AnimRef[] = [];
  private mats = new Map<string, MeshStandardMaterial>();
  private lineMat = new LineBasicMaterial({ color: 0x1b1b1f, transparent: true, opacity: 0.3 });
  private bounds = new Box3(new Vector3(-0.5, 0, 0), new Vector3(0.5, 2, 0.6));
  private raycaster = new Raycaster();
  private lastTick = 0;
  private dirty = true;
  private raf = 0;
  private tween: { t0: number; dur: number; p0: Vector3; p1: Vector3; c0: Vector3; c1: Vector3 } | null = null;
  private ro: ResizeObserver;
  private disposed = false;
  private pointerStart: { x: number; y: number; t: number } | null = null;
  private selectedId: string | null = null;
  private moduleGroups = new Map<string, Group>();
  private currentRoom: RoomConfig | null = null;
  private dimGroup = new Group();
  private showDimensions = false;

  get room(): RoomConfig | null {
    return this.currentRoom;
  }

  private currentModules: Module[] = [];

  onPick: (id: string | null) => void = () => {};
  onAnimChange: () => void = () => {};
  onModuleDrag?: (id: string, x: number) => void;
  onModuleDragEnd?: (id: string, x: number) => void;
  onContextMenu?: (moduleId: string | null, x: number, y: number) => void;

  private dragCandidate: {
    moduleId: string;
    startClientX: number;
    startClientY: number;
    startModuleX: number;
    startHitWorldX: number;
    dragPlane: Plane;
  } | null = null;
  private isDragging = false;

  private container: HTMLElement;
  private resolve: () => Material[];

  constructor(container: HTMLElement, resolve: () => Material[]) {
    this.container = container;
    this.resolve = resolve;
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', '3D-модель мебели. Перетащите, чтобы повернуть.');

    this.scene.background = new Color('#e9e7e2');
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();

    this.scene.add(new HemisphereLight(0xffffff, 0xd2cbbf, 0.45), new AmbientLight(0xffffff, 0.12));

    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.sun = new DirectionalLight(0xffffff, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.92 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.wall = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: '#f5f3ef', roughness: 1 }));
    this.wall.receiveShadow = true;
    this.scene.add(this.floor, this.wall, this.roomGroup, this.modules, this.dimGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 14;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.invalidate());

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };

      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      if (hit && hit.object.userData.moduleId) {
        const moduleId = hit.object.userData.moduleId as string;
        const g = this.moduleGroups.get(moduleId);
        if (g) {
          const startModX = Math.round(g.position.x / MM);
          const dragPlane = new Plane(new Vector3(0, 0, 1), -hit.point.z);
          this.dragCandidate = {
            moduleId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startModuleX: startModX,
            startHitWorldX: hit.point.x,
            dragPlane,
          };
        }
      } else {
        this.dragCandidate = null;
      }
    });

    el.addEventListener('pointerup', (e) => this.handleUp(e));

    el.addEventListener('pointermove', (e) => {
      if (this.dragCandidate) {
        const dx = e.clientX - this.dragCandidate.startClientX;
        const dy = e.clientY - this.dragCandidate.startClientY;
        if (!this.isDragging && Math.hypot(dx, dy) > 6) {
          this.isDragging = true;
          this.controls.enabled = false;
          el.style.cursor = 'grabbing';
          this.onPick(this.dragCandidate.moduleId);
        }
        if (this.isDragging) {
          const r = el.getBoundingClientRect();
          const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          this.raycaster.setFromCamera(ndc, this.camera);
          const hitPt = new Vector3();
          if (this.raycaster.ray.intersectPlane(this.dragCandidate.dragPlane, hitPt)) {
            const deltaWorldX = hitPt.x - this.dragCandidate.startHitWorldX;
            let newX = Math.round((this.dragCandidate.startModuleX + deltaWorldX / MM) / 10) * 10;

            // Магнитная автостыковка (Snapping) к соседним шкафам и углам стены (в пределах 45 мм)
            const curMod = this.currentModules.find((m) => m.id === this.dragCandidate?.moduleId);
            if (curMod) {
              const snapDist = 45;
              const candidates: number[] = [0];
              if (this.currentRoom) candidates.push(this.currentRoom.w - curMod.w);
              for (const other of this.currentModules) {
                if (other.id === curMod.id) continue;
                if (Math.abs(other.lift - curMod.lift) < 80) {
                  candidates.push(other.x + other.w); // встык справа
                  candidates.push(other.x - curMod.w); // встык слева
                }
              }
              for (const cand of candidates) {
                if (Math.abs(newX - cand) <= snapDist) {
                  newX = cand;
                  break;
                }
              }
            }

            const g = this.moduleGroups.get(this.dragCandidate.moduleId);
            if (g) {
              g.position.x = newX * MM;
              if (this.helper) {
                this.helper.box.setFromObject(g).expandByScalar(0.012);
              }
              this.invalidate();
            }
            this.onModuleDrag?.(this.dragCandidate.moduleId, newX);
          }
          return;
        }
      }

      if (this.pointerStart && Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 6) return;
      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      if (hit && hit.object.userData.animKey) {
        el.style.cursor = 'pointer';
      } else if (hit) {
        el.style.cursor = 'grab';
      } else {
        el.style.cursor = 'default';
      }
    });

    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      if (hit && hit.object.userData.moduleId) {
        const mid = hit.object.userData.moduleId as string;
        this.onPick(mid);
        this.onContextMenu?.(mid, e.clientX, e.clientY);
      } else {
        this.onContextMenu?.(null, e.clientX, e.clientY);
      }
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.frame('iso', false);
  }

  // ——— публичное API ———

  update(modules: Module[]): void {
    this.currentModules = modules;
    const prevTargets = new Map<string, number>();
    for (const a of this.anims) {
      if (a.target > 0 || a.t > 0) prevTargets.set(a.anim.key, a.target);
    }
    this.clear();
    const matMap = new Map(this.resolve().map((m) => [m.id, m]));
    this.bounds.makeEmpty();

    for (const m of modules) {
      const built = buildModule(m);
      const g = new Group();
      g.position.set(m.x * MM, m.lift * MM, 0);
      g.userData.moduleId = m.id;
      this.moduleGroups.set(m.id, g);

      const buckets = new Map<string, { mat: MeshStandardMaterial; geos: BufferGeometry[]; shadow: boolean }>();
      const animGroups = new Map<string, { group: Group; geos: Map<string, { mat: MeshStandardMaterial; geos: BufferGeometry[] }>; anim: PartAnim }>();

      for (const p of built.parts) {
        const mat = this.partMaterial(p, m, matMap);
        const a = p.anim;
        if (a) {
          let ag = animGroups.get(a.key);
          if (!ag) {
            const group = new Group();
            if (a.type === 'door' && a.pivot) group.position.set(a.pivot[0] * MM, 0, a.pivot[1] * MM);
            ag = { group, geos: new Map(), anim: a };
            animGroups.set(a.key, ag);
          }
          const off: [number, number, number] = a.type === 'door' && a.pivot ? [a.pivot[0] * MM, 0, a.pivot[1] * MM] : [0, 0, 0];
          const k = mat.uuid;
          const b = ag.geos.get(k) ?? { mat, geos: [] };
          b.geos.push(partGeo(p, off));
          ag.geos.set(k, b);
        } else {
          const b = buckets.get(mat.uuid) ?? { mat, geos: [], shadow: true };
          b.geos.push(partGeo(p, [0, 0, 0]));
          buckets.set(mat.uuid, b);
        }
      }

      const emit = (parent: Group, mat: MeshStandardMaterial, geos: BufferGeometry[], animKey?: string) => {
        const merged = mergeGeometries(geos, false);
        geos.forEach((x) => x.dispose());
        if (!merged) return;
        const mesh = new Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.moduleId = m.id;
        if (animKey) {
          mesh.userData.animKey = animKey;
        }
        parent.add(mesh);
        this.pickables.push(mesh);
        const edges = new LineSegments(new EdgesGeometry(merged, 25), this.lineMat);
        parent.add(edges);
        this.lines.push(edges);
      };

      buckets.forEach((b) => emit(g, b.mat, b.geos));
      animGroups.forEach((ag) => {
        ag.geos.forEach((b) => emit(ag.group, b.mat, b.geos, ag.anim.key));
        g.add(ag.group);
        const prevT = prevTargets.get(ag.anim.key) ?? 0;
        this.anims.push({ group: ag.group, anim: ag.anim, t: prevT, target: prevT });
      });

      this.modules.add(g);
      this.bounds.union(
        new Box3(
          new Vector3(m.x * MM, m.lift * MM, 0),
          new Vector3((m.x + built.width) * MM, (m.lift + built.height) * MM, built.depth * MM),
        ),
      );
    }

    if (this.bounds.isEmpty()) this.bounds.set(new Vector3(-0.5, 0, 0), new Vector3(0.5, 2, 0.6));
    this.layoutEnvironment();
    this.applyOpen();
    this.setSelected(this.selectedId);
    this.updateDimensions();
    this.invalidate();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    if (this.helper) {
      this.scene.remove(this.helper);
      this.helper.dispose();
      this.helper = null;
    }
    const g = id ? this.moduleGroups.get(id) : null;
    if (g) {
      const box = new Box3().setFromObject(g).expandByScalar(0.012);
      this.helper = new Box3Helper(box, new Color('#3b82f6'));
      this.scene.add(this.helper);
    }
    this.updateDimensions();
    this.invalidate();
  }

  setOpen(open: boolean): void {
    const target = open ? 1 : 0;
    for (const ref of this.anims) {
      ref.target = target;
    }
    this.lastTick = performance.now();
    this.schedule();
    this.onAnimChange();
  }

  isOpen(): boolean {
    return this.anims.some((a) => a.target === 1 || a.t > 0.4);
  }

  toggleDimensions(): boolean {
    this.showDimensions = !this.showDimensions;
    this.updateDimensions();
    this.invalidate();
    return this.showDimensions;
  }

  isDimensions(): boolean {
    return this.showDimensions;
  }

  toggleAnim(key: string): void {
    const ref = this.anims.find((a) => a.anim.key === key);
    if (!ref) return;
    ref.target = ref.target === 1 ? 0 : 1;
    this.lastTick = performance.now();
    this.schedule();
    this.onAnimChange();
  }

  frame(view: ViewName, animate = true): void {
    const c = this.bounds.getCenter(new Vector3());
    const s = this.bounds.getSize(new Vector3());
    const tanV = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const aspect = Math.max(0.4, this.camera.aspect);
    const fitH = (s.y * 0.62) / tanV;
    const fitW = (s.x * 0.62) / (tanV * aspect);
    const dist = Math.max(fitH, fitW, 1.6) + s.z * 0.6;
    const target = new Vector3(c.x, c.y * 0.92, s.z * 0.35);
    const pos = target.clone();
    if (view === 'front') pos.add(new Vector3(0, s.y * 0.05, dist));
    else if (view === 'top') pos.add(new Vector3(0, dist * 1.05, 0.001));
    else if (view === 'side') pos.add(new Vector3(dist, s.y * 0.1, s.z * 0.3));
    else pos.add(new Vector3(dist * 0.62, dist * 0.34, dist * 0.86));
    this.moveCamera(pos, target, animate);
  }

  snapshot(width: number, height: number): string {
    const el = this.renderer.domElement;
    const prevPR = this.renderer.getPixelRatio();
    const prevSize = new Vector2();
    this.renderer.getSize(prevSize);
    const prevAspect = this.camera.aspect;
    const prevMap = this.sun.shadow.mapSize.clone();
    const helperVis = this.helper?.visible ?? false;
    if (this.helper) this.helper.visible = false;
    this.lines.forEach((l) => (l.visible = false));

    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = el.toDataURL('image/png');

    this.sun.shadow.mapSize.copy(prevMap);
    (this.sun.shadow as { map?: { dispose(): void } | null }).map?.dispose();
    this.sun.shadow.map = null;
    this.renderer.setPixelRatio(prevPR);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    this.lines.forEach((l) => (l.visible = true));
    if (this.helper) this.helper.visible = helperVis;
    this.invalidate();
    return url;
  }

  async exportGLB(): Promise<Blob> {
    const saved = this.anims.map((a) => a.t);
    for (const a of this.anims) a.t = 0;
    this.applyOpen();
    const hv = this.helper?.visible ?? false;
    if (this.helper) this.helper.visible = false;
    this.lines.forEach((l) => (l.visible = false));
    try {
      const exporter = new GLTFExporter();
      const buf = (await exporter.parseAsync(this.modules, { binary: true, onlyVisible: true })) as ArrayBuffer;
      return new Blob([buf], { type: 'model/gltf-binary' });
    } finally {
      this.lines.forEach((l) => (l.visible = true));
      if (this.helper) this.helper.visible = hv;
      this.anims.forEach((a, i) => (a.t = saved[i] ?? 0));
      this.applyOpen();
      this.invalidate();
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clear();
    this.clearDimensions();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ——— внутреннее ———

  private partMaterial(p: Part, m: Module, matMap: Map<string, Material>): MeshStandardMaterial {
    let key: string;
    switch (p.mat) {
      case 'corpus': key = m.matCorpus; break;
      case 'facade': key = m.matFacade; break;
      case 'back': key = m.matBack; break;
      case 'top': key = m.matTop; break;
      default: key = p.mat;
    }
    const hit = this.mats.get(key);
    if (hit) return hit;
    let mat: MeshStandardMaterial;
    if (key === 'metal') mat = new MeshStandardMaterial({ color: '#c3c6cb', metalness: 0.95, roughness: 0.22 });
    else if (key === 'handle') mat = new MeshStandardMaterial({ color: '#b5b8bd', metalness: 0.9, roughness: 0.3 });
    else {
      const d = matMap.get(key);
      const color = d?.color ?? '#cccccc';
      let map = null;
      let roughness = 0.72;
      let metalness = 0;

      if (d?.grain) {
        map = grainTexture(color, this.renderer.capabilities.getMaxAnisotropy());
        roughness = 0.65;
      } else if (d?.stone) {
        map = stoneTexture(color, this.renderer.capabilities.getMaxAnisotropy());
        roughness = 0.46;
      } else if (d?.supermat) {
        roughness = 0.94; // PerfectSense Matt Soft-Touch
      } else if (d?.gloss) {
        roughness = 0.22;
        metalness = 0.04;
      } else if (p.mat === 'top') {
        roughness = 0.45;
      }

      mat = new MeshStandardMaterial({
        color: map ? '#ffffff' : color,
        map,
        roughness,
        metalness,
      });
    }
    this.mats.set(key, mat);
    return mat;
  }

  private clear(): void {
    for (const g of this.moduleGroups.values()) {
      g.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
      });
    }
    this.modules.clear();
    this.moduleGroups.clear();
    this.pickables = [];
    this.lines = [];
    this.anims = [];
  }

  private clearDimensions(): void {
    this.dimGroup.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      } else if (o instanceof Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.dimGroup.clear();
  }

  private updateDimensions(): void {
    this.clearDimensions();
    if (!this.showDimensions || this.currentModules.length === 0) return;

    const segments: [Vector3, Vector3][] = [];
    const color = 0x2563eb;

    // 1. Module dimensions
    const selMod = this.selectedId ? this.currentModules.find((m) => m.id === this.selectedId) : null;
    if (selMod) {
      const x0 = selMod.x * MM;
      const x1 = (selMod.x + selMod.w) * MM;
      const y0 = selMod.lift * MM;
      const y1 = (selMod.lift + selMod.h) * MM;
      const z0 = 0;
      const z1 = selMod.d * MM;

      // Width dimension (above top front edge)
      const yt = y1 + 0.06;
      segments.push([new Vector3(x0, yt, z1), new Vector3(x1, yt, z1)]);
      segments.push([new Vector3(x0, yt - 0.03, z1), new Vector3(x0, yt + 0.03, z1)]);
      segments.push([new Vector3(x1, yt - 0.03, z1), new Vector3(x1, yt + 0.03, z1)]);
      const spW = makeTextSprite(`Ш: ${selMod.w} мм`, '#38bdf8');
      spW.position.set((x0 + x1) / 2, yt + 0.05, z1);
      this.dimGroup.add(spW);

      // Height dimension (right side front edge)
      const xr = x1 + 0.06;
      segments.push([new Vector3(xr, y0, z1), new Vector3(xr, y1, z1)]);
      segments.push([new Vector3(xr - 0.03, y0, z1), new Vector3(xr + 0.03, y0, z1)]);
      segments.push([new Vector3(xr - 0.03, y1, z1), new Vector3(xr + 0.03, y1, z1)]);
      const spH = makeTextSprite(`В: ${selMod.h} мм`, '#38bdf8');
      spH.position.set(xr + 0.05, (y0 + y1) / 2, z1);
      this.dimGroup.add(spH);

      // Depth dimension (right side bottom edge)
      segments.push([new Vector3(xr, y0, z0), new Vector3(xr, y0, z1)]);
      segments.push([new Vector3(xr - 0.03, y0, z0), new Vector3(xr + 0.03, y0, z0)]);
      segments.push([new Vector3(xr - 0.03, y0, z1), new Vector3(xr + 0.03, y0, z1)]);
      const spD = makeTextSprite(`Г: ${selMod.d} мм`, '#38bdf8');
      spD.position.set(xr + 0.05, y0 + 0.04, (z0 + z1) / 2);
      this.dimGroup.add(spD);
    } else {
      for (const m of this.currentModules) {
        const mx0 = m.x * MM;
        const mx1 = (m.x + m.w) * MM;
        const my = (m.lift + m.h) * MM + 0.04;
        const mz = m.d * MM;
        segments.push([new Vector3(mx0, my, mz), new Vector3(mx1, my, mz)]);
        segments.push([new Vector3(mx0, my - 0.02, mz), new Vector3(mx0, my + 0.02, mz)]);
        segments.push([new Vector3(mx1, my - 0.02, mz), new Vector3(mx1, my + 0.02, mz)]);
        const sp = makeTextSprite(`${m.w} мм`, '#94a3b8');
        sp.position.set((mx0 + mx1) / 2, my + 0.04, mz);
        this.dimGroup.add(sp);
      }
    }

    // 2. Kitchen run overall width line
    let minX = Infinity;
    let maxX = -Infinity;
    let maxD = 600;
    for (const m of this.currentModules) {
      if (m.x < minX) minX = m.x;
      if (m.x + m.w > maxX) maxX = m.x + m.w;
      if (m.d > maxD) maxD = m.d;
    }
    if (minX < maxX) {
      const rx0 = minX * MM;
      const rx1 = maxX * MM;
      const ry = 0.015;
      const rz = (maxD + 120) * MM;
      segments.push([new Vector3(rx0, ry, rz), new Vector3(rx1, ry, rz)]);
      segments.push([new Vector3(rx0, ry, rz - 0.04), new Vector3(rx0, ry, rz + 0.04)]);
      segments.push([new Vector3(rx1, ry, rz - 0.04), new Vector3(rx1, ry, rz + 0.04)]);

      const totalW = Math.round(maxX - minX);
      const isOver = this.currentRoom && totalW > this.currentRoom.w;
      const spRun = makeTextSprite(`Итого L = ${totalW} мм${isOver ? ' (!)' : ''}`, isOver ? '#ef4444' : '#10b981');
      spRun.position.set((rx0 + rx1) / 2, ry + 0.04, rz);
      this.dimGroup.add(spRun);
    }

    if (segments.length > 0) {
      this.dimGroup.add(createDimLines(segments, color));
    }
  }

  private layoutEnvironment(): void {
    const b = this.bounds;
    const c = b.getCenter(new Vector3());
    const s = b.getSize(new Vector3());
    const wallW = s.x + 6;
    this.wall.scale.set(wallW, Math.max(3.2, s.y + 0.6), 1);
    this.wall.position.set(c.x, this.wall.scale.y / 2, -0.003);
    this.floor.position.set(c.x, 0, 0);

    const span = Math.max(s.x, s.y, 2) * 0.9 + 1.5;
    const cam = this.sun.shadow.camera;
    cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
    cam.near = 0.5; cam.far = 24;
    cam.updateProjectionMatrix();
    this.sun.position.set(c.x + 2.8, Math.max(s.y, 2) * 1.9 + 1.5, 4.5);
    this.sun.target.position.set(c.x, s.y * 0.4, 0.3);
    this.sun.target.updateMatrixWorld();
  }

  private applyOpen(): void {
    for (const { group, anim, t } of this.anims) {
      if (anim.type === 'door') group.rotation.y = MathUtils.degToRad((anim.ang ?? 0) * t);
      else if (anim.type === 'sliding') group.position.x = ((anim.travelX ?? 0) * MM) * t;
      else group.position.z = ((anim.travel ?? 0) * MM) * t;
    }
  }

  private moveCamera(pos: Vector3, target: Vector3, animate: boolean): void {
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.controls.update();
      this.invalidate();
      return;
    }
    this.tween = {
      t0: performance.now(), dur: 520, p0: this.camera.position.clone(), p1: pos, c0: this.controls.target.clone(), c1: target,
    };
    this.schedule();
  }

  private handleUp(e: PointerEvent): void {
    if (e.button !== 0) return;

    if (this.isDragging && this.dragCandidate) {
      const g = this.moduleGroups.get(this.dragCandidate.moduleId);
      const finalX = g ? Math.round(g.position.x / MM) : this.dragCandidate.startModuleX;
      this.onModuleDragEnd?.(this.dragCandidate.moduleId, finalX);
      this.isDragging = false;
      this.dragCandidate = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'default';
      this.pointerStart = null;
      return;
    }
    this.dragCandidate = null;
    this.isDragging = false;
    this.controls.enabled = true;

    const s = this.pointerStart;
    this.pointerStart = null;
    if (!s) return;
    const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    const elapsed = performance.now() - s.t;
    if (dist > 10 || elapsed > 650) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (hit) {
      const animKey = hit.object.userData.animKey as string | undefined;
      if (animKey) {
        this.toggleAnim(animKey);
      }
      this.onPick((hit.object.userData.moduleId as string | undefined) ?? null);
    } else {
      this.onPick(null);
    }
  }

  updateRoom(room: RoomConfig): void {
    this.currentRoom = room;
    while (this.roomGroup.children.length > 0) {
      const obj = this.roomGroup.children[0];
      this.roomGroup.remove(obj);
      if (obj instanceof Mesh) obj.geometry.dispose();
    }
    this.roomMats.forEach((m) => m.dispose());

    const W = room.w * MM;
    const D = room.d * MM;
    const H = room.h * MM;
    const T = 0.12;

    const wallMat = new MeshStandardMaterial({ color: '#f8fafc', roughness: 0.95 });
    const trimMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
    const glassMat = new MeshStandardMaterial({ color: '#bae6fd', roughness: 0.1, transparent: true, opacity: 0.45 });
    const floorMat = new MeshStandardMaterial({ color: '#e2d9cc', roughness: 0.85 });
    this.roomMats = [wallMat, trimMat, glassMat, floorMat];

    const roomFloor = new Mesh(new BoxGeometry(W, 0.02, D), floorMat);
    roomFloor.position.set(W / 2, -0.01, D / 2);
    roomFloor.receiveShadow = true;
    this.roomGroup.add(roomFloor);

    type Opening = { a0: number; a1: number; y0: number; y1: number; glass: boolean };
    const EPS = 0.01;

    /**
     * Строит одну стену из блоков вокруг любого числа проёмов (окна и двери).
     * axis 'x': стена вдоль X (задняя), толщина по Z; axis 'z': стена вдоль Z (боковая), толщина по X.
     * off — координата плоскости стены (центр толщины).
     */
    const buildWall = (axis: 'x' | 'z', span: number, off: number, openings: Opening[]): void => {
      const put = (a0: number, a1: number, y0: number, y1: number, mat: MeshStandardMaterial = wallMat, thick = T, shift = 0): Mesh | null => {
        const len = a1 - a0;
        const hgt = y1 - y0;
        if (len < EPS || hgt < EPS) return null;
        const mesh = new Mesh(
          axis === 'x' ? new BoxGeometry(len, hgt, thick) : new BoxGeometry(thick, hgt, len),
          mat,
        );
        const c = a0 + len / 2;
        if (axis === 'x') mesh.position.set(c, y0 + hgt / 2, off + shift);
        else mesh.position.set(off + shift, y0 + hgt / 2, c);
        mesh.receiveShadow = mat === wallMat || mat === trimMat;
        this.roomGroup.add(mesh);
        return mesh;
      };

      const sorted = openings
        .map((o) => ({ ...o, a0: Math.max(0, o.a0), a1: Math.min(span, o.a1), y1: Math.min(H, o.y1) }))
        .filter((o) => o.a1 - o.a0 > EPS)
        .sort((p, q) => p.a0 - q.a0);

      // перекрывающиеся проёмы сдвигаем, чтобы не рисовать стену «внахлёст»
      let cursor = 0;
      for (const o of sorted) {
        o.a0 = Math.max(o.a0, cursor);
        if (o.a1 - o.a0 < EPS) continue;
        put(cursor, o.a0, 0, H);                 // глухой простенок до проёма
        put(o.a0, o.a1, 0, o.y0);                // под окном
        put(o.a0, o.a1, o.y1, H);                // над проёмом
        if (o.glass) {
          const ga = o.a0 + 0.03;
          const gb = o.a1 - 0.03;
          put(ga, gb, o.y0 + 0.03, o.y1 - 0.03, glassMat, 0.01);
          // подоконник: выступает внутрь помещения
          const sillShift = axis === 'x' ? 0.04 : (off < W / 2 ? 0.04 : -0.04);
          put(o.a0 - 0.05, o.a1 + 0.05, o.y0, o.y0 + 0.04, trimMat, T + 0.08, sillShift);
        }
        cursor = o.a1;
      }
      put(cursor, span, 0, H);
    };

    const collect = (wall: 'back' | 'left' | 'right'): Opening[] => [
      ...room.windows.filter((w) => w.wall === wall).map((w) => ({
        a0: w.x * MM, a1: (w.x + w.w) * MM, y0: w.lift * MM, y1: (w.lift + w.h) * MM, glass: true,
      })),
      ...room.doors.filter((d) => d.wall === wall).map((d) => ({
        a0: d.x * MM, a1: (d.x + d.w) * MM, y0: 0, y1: d.h * MM, glass: false,
      })),
    ];

    buildWall('x', W, -T / 2, collect('back'));
    buildWall('z', D, -T / 2, collect('left'));
    buildWall('z', D, W + T / 2, collect('right'));

    this.wall.visible = false;
    this.floor.visible = false;
    if (this.showDimensions) this.updateDimensions();
    this.invalidate();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    this.raf = 0;
    if (this.disposed) return;
    const now = performance.now();
    let again = false;

    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
      this.controls.target.lerpVectors(this.tween.c0, this.tween.c1, e);
      if (k >= 1) this.tween = null;
      again = true;
      this.dirty = true;
    }

    let animating = false;
    for (const ref of this.anims) {
      if (ref.t !== ref.target) {
        const delta = Math.min(0.08, (now - (this.lastTick || now)) / 420);
        const dir = Math.sign(ref.target - ref.t);
        ref.t = MathUtils.clamp(ref.t + dir * delta, 0, 1);
        if ((dir > 0 && ref.t >= ref.target) || (dir < 0 && ref.t <= ref.target)) {
          ref.t = ref.target;
        }
        if (ref.anim.type === 'door') ref.group.rotation.y = MathUtils.degToRad((ref.anim.ang ?? 0) * ref.t);
        else if (ref.anim.type === 'sliding') ref.group.position.x = ((ref.anim.travelX ?? 0) * MM) * ref.t;
        else ref.group.position.z = ((ref.anim.travel ?? 0) * MM) * ref.t;
        animating = true;
        this.dirty = true;
      }
    }
    this.lastTick = now;
    if (animating) again = true;

    if (this.controls.update()) {
      again = true;
      this.dirty = true;
    }

    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
    if (again) this.schedule();
  };
}
