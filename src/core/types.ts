/** Доменные типы. Все размеры в миллиметрах, y — вверх, z=0 — стена, +z — к зрителю. */

export type Kind = 'wardrobe' | 'tall' | 'base' | 'wall' | 'corner' | 'cornerWall';
export type DoorMode = 'none' | 'hinged' | 'sliding';
export type MatKind = 'sheet' | 'facade' | 'back' | 'top';

export interface Section {
  shelves: number;
  drawers: number;
  rod?: boolean; // legacy
  rods: number;  // количество штанг: 0, 1, 2
  door: boolean;
}

export interface Module {
  id: string;
  name: string;
  kind: Kind;
  /** положение по X, мм */
  x: number;
  mirror: boolean;
  w: number;
  h: number;
  d: number;
  plinth: number;
  /** высота нижней кромки над полом (для навесных), мм */
  lift: number;
  /** толщина ЛДСП, мм */
  t: number;
  sections: Section[];
  doorMode: DoorMode;
  slidingCount: number;
  drawerH: number;
  handles: boolean;
  countertop: boolean;
  matCorpus: string;
  matFacade: string;
  matBack: string;
  matTop: string;
  milling?: 'modern' | 'frame' | 'ribbed';
  plinthColor?: 'corpus' | 'facade' | 'black';
  hinge?: 'left' | 'right' | 'top';
  /** Высота верхней доборной планки / карниза под потолок, мм (0 = нет). */
  topTrim?: number;
  /** Стена размещения модуля (для Г-образных и П-образных кухонь). По умолчанию 'back'. */
  wall?: 'back' | 'left' | 'right';
  /** Угловой прямой шкаф с глухой зоной (утоплен в угол): сторона глухой части. */
  blindSide?: 'left' | 'right';
  /** Ширина глухой зоны (включая угловую планку), мм (например 530 для низа, 330 для верха). */
  blindW?: number;
  /** Ширина угловой планки-компенсатора между перпендикулярными шкафами, мм (стандарт 30 мм). */
  blindFillerW?: number;
  /** Принудительное количество створок на секцию ('auto' | 1 | 2). */
  doorCount?: 'auto' | 1 | 2;
  /** Конфигурация углового модуля: Г-образный 90° (гармошка) или Трапеция 45° (пятиугольный скошенный). */
  cornerMode?: 'l-shape' | 'diagonal';
  /** Длина бокового крыла углового модуля вдоль перпендикулярной стены, мм (по умолчанию равна w). */
  cornerW2?: number;
  /** Врезная мойка в угловом модуле. */
  cornerSink?: boolean;
  /** Принудительное отображение варочной поверхности на столешнице тумбы (true = вкл, false = выкл, undefined = авто по названию). */
  cooktop?: boolean;
  /** Положение ручки на распашном фасаде: сбоку вертикально, сверху горизонтально (в линию с ящиками) или торцевая сверху. */
  handlePos?: 'side' | 'top-horiz' | 'edge-top';
  /** Цвет лицевой фурнитуры / ручек ('silver' | 'black' | 'gold'). */
  handleColor?: 'silver' | 'black' | 'gold';
  /** Ручка на верхнем фасаде пенала с техникой (над СВЧ / духовкой). По умолчанию false = Push-to-Open (без ручки). */
  upperHandles?: boolean;
  /** Высота ниши под духовой шкаф в пенале, мм (по умолчанию 600). */
  ovenH?: number;
  /** Высота ниши под встроенную СВЧ в пенале, мм (по умолчанию 380, 0 = без СВЧ). */
  mwH?: number;
}

export type ProjectStatus = 'draft' | 'approved' | 'production' | 'done';

export interface Project {
  v: 1;
  id: string;
  name: string;
  updatedAt: number;
  modules: Module[];
  room?: import('./room').RoomConfig;
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  status?: ProjectStatus;
}

export interface Material {
  id: string;
  name: string;
  kind: MatKind;
  color: string;
  grain?: boolean;
  stone?: boolean;
  gloss?: boolean;
  supermat?: boolean;
  category?: string;
  /** цена, ₸ за м² */
  price: number;
}

export interface HardwareItem {
  name: string;
  unit: string;
  price: number;
}

export interface LaborSettings {
  shop: number;
  assembly: number;
  tech: number;
  logistics: number;
  markup: number;
}

export interface Settings {
  v: 1;
  company: { name: string; phone: string; note: string; validDays: number };
  waste: number;
  edgePrice: number;
  materials: Material[];
  hardware: Record<string, HardwareItem>;
  labor: LaborSettings;
}

export type PartMat =
  | 'corpus'
  | 'facade'
  | 'back'
  | 'top'
  | 'metal'
  | 'handle'
  | 'handle-black'
  | 'handle-gold'
  | 'black'
  | 'gold'
  | 'glass-bronze'
  | 'glass-graphite'
  | 'led-warm';

export interface PartAnim {
  type: 'door' | 'flap' | 'drawer' | 'sliding';
  key: string;
  /** точка вращения (x, z), мм — только для дверей */
  pivot?: [number, number];
  /** высота оси вращения (y), мм — для подъёмных фасадов вверх (flap) */
  pivotY?: number;
  /** угол открытия, градусы — только для дверей */
  ang?: number;
  /** величина выдвижения по Z, мм — только для ящиков */
  travel?: number;
  /** величина сдвига по X, мм — для раздвижных дверей купе */
  travelX?: number;
}

export interface Part {
  name: string;
  mat: PartMat;
  size: [number, number, number];
  pos: [number, number, number];
  shape?: 'box' | 'cyl';
  /** Поворот детали вокруг вертикальной оси Y (градусы), например 45° для трапециевидных угловых шкафов */
  rotY?: number;
  /** суммарная длина кромкуемых торцов, мм */
  edgeMm: number;
  /** участвует в деталировке и смете */
  sheet: boolean;
  anim?: PartAnim;
}

export interface BuiltModule {
  parts: Part[];
  hardware: Record<string, number>;
  width: number;
  depth: number;
  height: number;
}
