import type { HardwareItem, Kind, Material, Module, Section, Settings } from './types';
import { DEFAULT_ROOM } from './room';
import { uid } from './util';

export const BRAND = 'Mebel3D';

export const KIND_LABEL: Record<Kind, string> = {
  wardrobe: 'Шкаф',
  tall: 'Пенал',
  base: 'Нижний модуль',
  wall: 'Верхний модуль',
  corner: 'Угловой нижний',
  cornerWall: 'Угловой верхний',
};

export const WALL_KINDS: Kind[] = ['wall', 'cornerWall'];
export const CORNER_KINDS: Kind[] = ['corner', 'cornerWall'];
export const isWall = (k: Kind) => WALL_KINDS.includes(k);
export const isCorner = (k: Kind) => CORNER_KINDS.includes(k);

export const FACADE_T = 16;
export const BACK_T = 4;
export const COUNTERTOP_T = 38;

export const DEFAULT_MATERIALS: Material[] = [
  // ——— ЛДСП EGGER: Древесные (ST10 / ST12 / ST37 Feelwood) ———
  { id: 'eg-h1180', name: 'EGGER H1180 ST37 Дуб Галифакс натуральный', kind: 'sheet', color: '#b58a5c', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h1181', name: 'EGGER H1181 ST37 Дуб Галифакс табак', kind: 'sheet', color: '#6b4f3b', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h1176', name: 'EGGER H1176 ST37 Дуб Галифакс белый', kind: 'sheet', color: '#cfc4b6', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h3303', name: 'EGGER H3303 ST10 Дуб Гамильтон натуральный', kind: 'sheet', color: '#bfa280', grain: true, category: 'EGGER Древесные', price: 5900 },
  { id: 'eg-h3331', name: 'EGGER H3331 ST10 Дуб Небраска натуральный', kind: 'sheet', color: '#b99b79', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h3332', name: 'EGGER H3332 ST10 Дуб Небраска серый', kind: 'sheet', color: '#8a8279', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h1145', name: 'EGGER H1145 ST10 Дуб Бардолино натуральный', kind: 'sheet', color: '#c8b398', grain: true, category: 'EGGER Древесные', price: 5400 },
  { id: 'eg-h3734', name: 'EGGER H3734 ST9 Орех Дижон натуральный', kind: 'sheet', color: '#654a3a', grain: true, category: 'EGGER Древесные', price: 5900 },
  { id: 'eg-h3700', name: 'EGGER H3700 ST10 Орех Пасифик натуральный', kind: 'sheet', color: '#745a49', grain: true, category: 'EGGER Древесные', price: 5700 },
  { id: 'eg-h3157', name: 'EGGER H3157 ST12 Дуб Винченца', kind: 'sheet', color: '#ab937a', grain: true, category: 'EGGER Древесные', price: 5500 },
  { id: 'eg-h1344', name: 'EGGER H1344 ST32 Дуб Шерман коньяк', kind: 'sheet', color: '#845d42', grain: true, category: 'EGGER Древесные', price: 6200 },
  { id: 'eg-h1250', name: 'EGGER H1250 ST36 Ясень Наварра', kind: 'sheet', color: '#ccbda9', grain: true, category: 'EGGER Древесные', price: 5600 },

  // ——— ЛДСП EGGER: Однотонные (ST9) ———
  { id: 'eg-u702', name: 'EGGER U702 ST9 Кашемир серый', kind: 'sheet', color: '#c8beaf', category: 'EGGER Однотонные', price: 5200 },
  { id: 'eg-w1000', name: 'EGGER W1000 ST9 Белый Премиум', kind: 'sheet', color: '#faf9f5', category: 'EGGER Однотонные', price: 4800 },
  { id: 'eg-w1100', name: 'EGGER W1100 ST9 Белый Альпийский', kind: 'sheet', color: '#ffffff', category: 'EGGER Однотонные', price: 4900 },
  { id: 'eg-w980', name: 'EGGER W980 ST2 Белый платиновый', kind: 'sheet', color: '#f4f3f0', category: 'EGGER Однотонные', price: 4400 },
  { id: 'eg-u708', name: 'EGGER U708 ST9 Светло-серый', kind: 'sheet', color: '#cccbc7', category: 'EGGER Однотонные', price: 4600 },
  { id: 'eg-u732', name: 'EGGER U732 ST9 Серый пыльный', kind: 'sheet', color: '#8c8984', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u961', name: 'EGGER U961 ST9 Графит серый', kind: 'sheet', color: '#52565b', category: 'EGGER Однотонные', price: 5300 },
  { id: 'eg-u999', name: 'EGGER U999 ST9 Чёрный', kind: 'sheet', color: '#202124', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u763', name: 'EGGER U763 ST9 Серый перламутровый', kind: 'sheet', color: '#a5a19c', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u599', name: 'EGGER U599 ST9 Индиго синий', kind: 'sheet', color: '#2d3d52', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u606', name: 'EGGER U606 ST9 Лесной зелёный', kind: 'sheet', color: '#3a4d41', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u156', name: 'EGGER U156 ST9 Бежевый песочный', kind: 'sheet', color: '#dfd3c3', category: 'EGGER Однотонные', price: 4900 },
  { id: 'eg-u636', name: 'EGGER U636 ST9 Фьорд зелёный', kind: 'sheet', color: '#5e7a75', category: 'EGGER Однотонные', price: 5300 },

  // ——— ЛДСП EGGER: Бетон и камень ———
  { id: 'eg-f186', name: 'EGGER F186 ST9 Бетон Чикаго светло-серый', kind: 'sheet', color: '#bcbbb7', stone: true, category: 'EGGER Камень и бетон', price: 6400 },
  { id: 'eg-f187', name: 'EGGER F187 ST9 Бетон Чикаго тёмный', kind: 'sheet', color: '#585756', stone: true, category: 'EGGER Камень и бетон', price: 6400 },
  { id: 'eg-f206', name: 'EGGER F206 ST9 Камень Пьетра Гриджиа чёрный', kind: 'sheet', color: '#303135', stone: true, category: 'EGGER Камень и бетон', price: 6600 },
  { id: 'eg-f204', name: 'EGGER F204 ST9 Камень Пьетра Гриджиа белый', kind: 'sheet', color: '#dfdad3', stone: true, category: 'EGGER Камень и бетон', price: 6600 },
  { id: 'eg-f812', name: 'EGGER F812 ST9 Мрамор Леванто белый', kind: 'sheet', color: '#eeebe5', stone: true, category: 'EGGER Камень и бетон', price: 6800 },
  { id: 'eg-f242', name: 'EGGER F242 ST10 Юрский сланец антрацит', kind: 'sheet', color: '#434346', stone: true, category: 'EGGER Камень и бетон', price: 6500 },

  // ——— Фасады: EGGER PerfectSense Matt (PM) суперматовые ———
  { id: 'pm-w1100', name: 'EGGER PM W1100 Белый Альпийский супермат', kind: 'facade', color: '#ffffff', supermat: true, category: 'EGGER PerfectSense Matt', price: 28000 },
  { id: 'pm-u702', name: 'EGGER PM U702 Кашемир супермат', kind: 'facade', color: '#c8beaf', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u727', name: 'EGGER PM U727 Глиняный серый супермат', kind: 'facade', color: '#9a9187', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u732', name: 'EGGER PM U732 Серый пыльный супермат', kind: 'facade', color: '#8c8984', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u961', name: 'EGGER PM U961 Графит супермат', kind: 'facade', color: '#4c5055', supermat: true, category: 'EGGER PerfectSense Matt', price: 29500 },
  { id: 'pm-u999', name: 'EGGER PM U999 Чёрный глубокий супермат', kind: 'facade', color: '#1a1a1c', supermat: true, category: 'EGGER PerfectSense Matt', price: 31000 },
  { id: 'pm-u599', name: 'EGGER PM U599 Индиго синий супермат', kind: 'facade', color: '#2c3b4e', supermat: true, category: 'EGGER PerfectSense Matt', price: 30000 },
  { id: 'pm-u606', name: 'EGGER PM U606 Тёмный изумруд супермат', kind: 'facade', color: '#2b3e34', supermat: true, category: 'EGGER PerfectSense Matt', price: 30000 },

  // ——— Фасады: AGT Supramat & Глянец ———
  { id: 'agt-3019', name: 'AGT Supramat 3019 Сафари серый', kind: 'facade', color: '#b2a99d', supermat: true, category: 'AGT Панели', price: 26000 },
  { id: 'agt-3020', name: 'AGT Supramat 3020 Макадамия', kind: 'facade', color: '#8e7a68', supermat: true, category: 'AGT Панели', price: 26000 },
  { id: 'agt-3024', name: 'AGT Supramat 3024 Трюфель', kind: 'facade', color: '#5a4d46', supermat: true, category: 'AGT Панели', price: 26500 },
  { id: 'agt-601', name: 'AGT 601 Белый высокий глянец', kind: 'facade', color: '#fafafc', gloss: true, category: 'AGT Панели', price: 24000 },

  // ——— Фасады: Базовые и эмаль ———
  { id: 'f-white', name: 'Фасад ЛДСП Белый гладкий', kind: 'facade', color: '#f4f3ef', category: 'Базовые фасады', price: 4200 },
  { id: 'f-sonoma', name: 'Фасад ЛДСП Дуб Сонома', kind: 'facade', color: '#cfae82', grain: true, category: 'Базовые фасады', price: 5200 },
  { id: 'f-walnut', name: 'Фасад ЛДСП Орех', kind: 'facade', color: '#6c4a35', grain: true, category: 'Базовые фасады', price: 5600 },
  { id: 'f-graphite', name: 'Фасад ЛДСП Графит', kind: 'facade', color: '#3c4046', category: 'Базовые фасады', price: 4800 },
  { id: 'm-ral1015', name: 'МДФ Эмаль Нежный беж (RAL 1015)', kind: 'facade', color: '#e6d9bd', gloss: false, category: 'МДФ Эмаль', price: 25000 },
  { id: 'eg-ral1015', name: 'ЛДСП Нежный беж (RAL 1015)', kind: 'sheet', color: '#e6d9bd', category: 'EGGER Однотонные', price: 5100 },
  { id: 'm-white', name: 'Фасад МДФ Эмаль Белый мат', kind: 'facade', color: '#fafaf7', gloss: false, category: 'МДФ Эмаль', price: 24000 },
  { id: 'm-grey', name: 'Фасад МДФ Эмаль Серый мат', kind: 'facade', color: '#9aa0a6', gloss: false, category: 'МДФ Эмаль', price: 25000 },
  { id: 'm-emerald', name: 'Фасад МДФ Эмаль Изумруд', kind: 'facade', color: '#2f5d50', gloss: false, category: 'МДФ Эмаль', price: 26000 },
  { id: 'm-navy', name: 'Фасад МДФ Эмаль Синий', kind: 'facade', color: '#2b3f66', gloss: false, category: 'МДФ Эмаль', price: 26000 },
  { id: 'm-terra', name: 'Фасад МДФ Эмаль Терракот', kind: 'facade', color: '#b9694c', gloss: false, category: 'МДФ Эмаль', price: 26000 },

  // ——— Влагостойкие столешницы 38 мм (EGGER / Slotex) ———
  { id: 'top-f812', name: 'EGGER F812 ST76 Мрамор Леванто белый 38 мм', kind: 'top', color: '#edebe6', stone: true, category: 'Столешницы EGGER 38 мм', price: 42000 },
  { id: 'top-f206', name: 'EGGER F206 ST9 Пьетра Гриджиа чёрный 38 мм', kind: 'top', color: '#2b2c30', stone: true, category: 'Столешницы EGGER 38 мм', price: 44000 },
  { id: 'top-f186', name: 'EGGER F186 ST9 Бетон Чикаго 38 мм', kind: 'top', color: '#b8b7b3', stone: true, category: 'Столешницы EGGER 38 мм', price: 39000 },
  { id: 'top-f187', name: 'EGGER F187 ST9 Бетон Чикаго тёмный 38 мм', kind: 'top', color: '#525150', stone: true, category: 'Столешницы EGGER 38 мм', price: 39000 },
  { id: 'top-h1180', name: 'EGGER H1180 ST37 Дуб Галифакс натуральный 38 мм', kind: 'top', color: '#b58a5c', grain: true, category: 'Столешницы EGGER 38 мм', price: 46000 },
  { id: 'top-h3303', name: 'EGGER H3303 ST10 Дуб Гамильтон 38 мм', kind: 'top', color: '#bfa280', grain: true, category: 'Столешницы EGGER 38 мм', price: 41000 },
  { id: 'top-f242', name: 'EGGER F242 ST10 Юрский сланец антрацит 38 мм', kind: 'top', color: '#3e3e41', stone: true, category: 'Столешницы EGGER 38 мм', price: 41000 },
  { id: 'top-w1000', name: 'EGGER W1000 ST76 Белый Премиум влагостойкий 38 мм', kind: 'top', color: '#f5f4ef', category: 'Столешницы EGGER 38 мм', price: 36000 },
  { id: 'top-h1344', name: 'EGGER H1344 ST32 Дуб Шерман коньяк 38 мм', kind: 'top', color: '#845d42', grain: true, category: 'Столешницы EGGER 38 мм', price: 42000 },
  { id: 't-stone', name: 'Столешница Камень светлый 38 мм', kind: 'top', color: '#d8d5ce', stone: true, category: 'Базовые столешницы', price: 38000 },
  { id: 't-dark', name: 'Столешница Камень тёмный 38 мм', kind: 'top', color: '#2b2b2e', stone: true, category: 'Базовые столешницы', price: 40000 },
  { id: 't-oak', name: 'Столешница Дуб натуральный 38 мм', kind: 'top', color: '#b8905f', grain: true, category: 'Базовые столешницы', price: 36000 },

  // ——— Задняя стенка (ХДФ / ДВП 4 мм) ———
  { id: 'b-white', name: 'ХДФ Белый 4 мм', kind: 'back', color: '#f0efe9', category: 'Задняя стенка (ХДФ)', price: 1400 },
  { id: 'b-grey', name: 'ХДФ Светло-серый 4 мм', kind: 'back', color: '#c8c8c5', category: 'Задняя стенка (ХДФ)', price: 1400 },
  { id: 'b-graphite', name: 'ХДФ Графит 4 мм', kind: 'back', color: '#42454a', category: 'Задняя стенка (ХДФ)', price: 1600 },
  { id: 'b-oak', name: 'ХДФ Дуб Галифакс / Сонома 4 мм', kind: 'back', color: '#bf9e76', grain: true, category: 'Задняя стенка (ХДФ)', price: 1800 },
  { id: 'b-black', name: 'ХДФ Чёрный 4 мм', kind: 'back', color: '#222225', category: 'Задняя стенка (ХДФ)', price: 1600 },

  // ——— Совместимость с ранними проектами ———
  { id: 's-white', name: 'ЛДСП Белый базовый', kind: 'sheet', color: '#f1f0ec', category: 'Базовые ЛДСП', price: 3600 },
  { id: 's-grey', name: 'ЛДСП Светло-серый базовый', kind: 'sheet', color: '#c6c8ca', category: 'Базовые ЛДСП', price: 3800 },
  { id: 's-graphite', name: 'ЛДСП Графит базовый', kind: 'sheet', color: '#3c4046', category: 'Базовые ЛДСП', price: 4300 },
  { id: 's-sonoma', name: 'ЛДСП Дуб Сонома базовый', kind: 'sheet', color: '#c9a77c', grain: true, category: 'Базовые ЛДСП', price: 4600 },
  { id: 's-walnut', name: 'ЛДСП Орех базовый', kind: 'sheet', color: '#6c4a35', grain: true, category: 'Базовые ЛДСП', price: 4900 },
  { id: 's-vanilla', name: 'ЛДСП Ваниль базовый', kind: 'sheet', color: '#e7ddc6', category: 'Базовые ЛДСП', price: 3900 },
];

export const DEFAULT_HARDWARE: Record<string, HardwareItem> = {
  hinge: { name: 'Петля с доводчиком', unit: 'шт', price: 1100 },
  rail: { name: 'Направляющие ящика (пара)', unit: 'компл', price: 7500 },
  handle: { name: 'Ручка', unit: 'шт', price: 1500 },
  leg: { name: 'Ножка регулируемая', unit: 'шт', price: 280 },
  rod: { name: 'Штанга хромированная', unit: 'м', price: 2600 },
  rodHolder: { name: 'Штангодержатель', unit: 'шт', price: 350 },
  pin: { name: 'Полкодержатель', unit: 'шт', price: 25 },
  confirmat: { name: 'Конфирмат / стяжка', unit: 'шт', price: 30 },
  hanger: { name: 'Навес (комплект)', unit: 'компл', price: 2800 },
  sliding: { name: 'Система купе (на дверь)', unit: 'шт', price: 32000 },
};

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  company: { name: BRAND, phone: '', note: 'Предложение действительно при сохранении цен на материалы.', validDays: 7 },
  waste: 15,
  edgePrice: 450,
  materials: DEFAULT_MATERIALS,
  hardware: DEFAULT_HARDWARE,
  labor: { shop: 18, assembly: 8, tech: 3, logistics: 4, markup: 25 },
};

export const LIMITS = {
  w: [50, 4000],
  h: [200, 2800],
  d: [150, 800],
  plinth: [0, 200],
  lift: [0, 2000],
  sections: [1, 5],
  shelves: [0, 12],
  drawers: [0, 6],
  rods: [0, 2],
  drawerH: [100, 400],
  sliding: [2, 4],
  x: [-10000, 30000],
} as const;

const sec = (p: Partial<Section> = {}): Section => {
  const r = p.rods ?? (p.rod ? 1 : 0);
  return {
    shelves: 0,
    drawers: 0,
    rods: r,
    rod: r > 0,
    door: true,
    ...p,
  };
};

function base(kind: Kind, name: string, o: Partial<Module>): Module {
  return {
    id: uid(),
    name,
    kind,
    x: 0,
    mirror: false,
    w: 600,
    h: 720,
    d: 560,
    plinth: 0,
    lift: 0,
    t: 16,
    sections: [sec()],
    doorMode: 'hinged',
    slidingCount: 2,
    drawerH: 200,
    handles: true,
    countertop: false,
    matCorpus: 'eg-w1000',
    matFacade: 'eg-h1180',
    matBack: 'b-white',
    matTop: 'top-f812',
    ...o,
  };
}

export interface Preset {
  id: string;
  label: string;
  hint: string;
  make: () => Module;
  /** Составное изделие: модули с x относительно начала группы (make возвращает первый). */
  group?: () => Module[];
}

export interface PresetGroup {
  id: string;
  label: string;
  ids: string[];
}

const bookcase = (x: number): Module =>
  base('tall', 'Стеллаж открытый', {
    x, w: 400, h: 2200, d: 350, plinth: 60, doorMode: 'none', handles: false,
    sections: [sec({ shelves: 5, door: false })],
  });

const tvStand = (x: number, w: number): Module =>
  base('base', 'Тумба под ТВ', {
    x, w, h: 450, d: 400, plinth: 60, doorMode: 'hinged', drawerH: 170, handles: false,
    sections: [sec({ shelves: 1 }), sec({ drawers: 2, door: false }), sec({ shelves: 1 })],
  });

const tvZone = (): Module[] => [
  bookcase(0),
  tvStand(400, 1800),
  base('wall', 'Полка над ТВ', { x: 400, w: 1800, h: 300, d: 300, lift: 1500, doorMode: 'none', handles: false, sections: [sec({ shelves: 0, door: false })] }),
  bookcase(2200),
];

export const PRESET_GROUPS: PresetGroup[] = [
  { id: 'kitchen', label: 'Кухня', ids: ['base', 'base-drawers', 'sink', 'oven', 'cargo', 'filler', 'filler-wall', 'wall', 'dish-dryer', 'mezzanine', 'corner', 'cornerWall', 'tall'] },
  { id: 'living', label: 'Гостиная и ТВ-зона', ids: ['tv-zone', 'tv-stand', 'tv-hanging', 'bookcase', 'dresser'] },
  { id: 'storage', label: 'Шкафы и прихожая', ids: ['wardrobe-sliding', 'wardrobe-hinged', 'hall-wardrobe', 'filler-tall', 'shoe', 'bedside'] },
  { id: 'fillers', label: 'Доборные планки (к стене / углу)', ids: ['filler', 'filler-wall', 'filler-tall', 'filler-corner'] },
];

export const PRESETS: Preset[] = [
  {
    id: 'base',
    label: 'Нижний модуль',
    hint: '600 × 820, дверца и полка',
    make: () => base('base', 'Нижний модуль', { w: 600, h: 820, d: 560, plinth: 100, countertop: true, sections: [sec({ shelves: 1 })] }),
  },
  {
    id: 'base-drawers',
    label: 'Нижний с ящиками',
    hint: '600 × 820, 3 ящика',
    make: () =>
      base('base', 'Нижний с ящиками', {
        w: 600, h: 820, d: 560, plinth: 100, countertop: true, doorMode: 'none', drawerH: 240,
        sections: [sec({ drawers: 3, door: false })],
      }),
  },
  {
    id: 'sink',
    label: 'Под мойку',
    hint: '800 × 820, две дверцы',
    make: () => base('base', 'Под мойку', { w: 800, h: 820, d: 560, plinth: 100, countertop: true, sections: [sec()] }),
  },
  {
    id: 'wall',
    label: 'Верхний модуль',
    hint: '600 × 720, навесной',
    make: () => base('wall', 'Верхний модуль', { w: 600, h: 720, d: 300, lift: 1450, sections: [sec({ shelves: 2 })] }),
  },
  {
    id: 'oven',
    label: 'Под духовку',
    hint: '600 × 820, ниша + ящик под противни',
    make: () =>
      base('base', 'Под духовку', {
        w: 600, h: 820, d: 560, plinth: 100, countertop: true, drawerH: 160, doorMode: 'none',
        sections: [sec({ drawers: 1, shelves: 1, door: false })],
      }),
  },
  {
    id: 'dish-dryer',
    label: 'Сушка для посуды',
    hint: '800 × 720, навесной двухуровневый',
    make: () => base('wall', 'Сушка для посуды', { w: 800, h: 720, d: 300, lift: 1450, sections: [sec({ shelves: 2 })] }),
  },
  {
    id: 'mezzanine',
    label: 'Антресоль (рейка)',
    hint: '600 × 360 × 560, рифлёный вельвет',
    make: () => base('wall', 'Антресоль', { w: 600, h: 360, d: 560, lift: 2170, milling: 'ribbed', handles: false, sections: [sec({ shelves: 0 })] }),
  },
  {
    id: 'corner',
    label: 'Угловой нижний',
    hint: '900 × 900, Г-образный',
    make: () => base('corner', 'Угловой нижний', { w: 900, h: 820, d: 560, plinth: 100, countertop: true, sections: [sec({ shelves: 1 })] }),
  },
  {
    id: 'cornerWall',
    label: 'Угловой верхний',
    hint: '600 × 600, навесной',
    make: () => base('cornerWall', 'Угловой верхний', { w: 600, h: 720, d: 300, lift: 1450, sections: [sec({ shelves: 2 })] }),
  },
  {
    id: 'tall',
    label: 'Пенал',
    hint: '600 × 2200, 4 полки',
    make: () => base('tall', 'Пенал', { w: 600, h: 2200, d: 560, plinth: 100, sections: [sec({ shelves: 4 })] }),
  },
  {
    id: 'wardrobe-sliding',
    label: 'Шкаф-купе',
    hint: '1800 × 2400, 2 двери',
    make: () =>
      base('wardrobe', 'Шкаф-купе', {
        w: 1800, h: 2400, d: 600, plinth: 80, doorMode: 'sliding', slidingCount: 2, matFacade: 'eg-h1180', matCorpus: 'eg-h1180',
        sections: [sec({ rod: true, shelves: 1 }), sec({ shelves: 5 })],
      }),
  },
  {
    id: 'wardrobe-hinged',
    label: 'Распашной шкаф',
    hint: '1200 × 2200, штанга, ящики',
    make: () =>
      base('wardrobe', 'Распашной шкаф', {
        w: 1200, h: 2200, d: 560, plinth: 80, drawerH: 220, matFacade: 'pm-u702', matCorpus: 'eg-w1000',
        sections: [sec({ rod: true, shelves: 1 }), sec({ shelves: 4, drawers: 2 })],
      }),
  },
  {
    id: 'tv-zone',
    label: 'ТВ-зона целиком',
    hint: '2600 мм: два стеллажа, тумба и полка',
    make: () => tvZone()[0],
    group: tvZone,
  },
  {
    id: 'tv-stand',
    label: 'Тумба под ТВ',
    hint: '1800 × 450, дверцы и ящики',
    make: () => tvStand(0, 1800),
  },
  {
    id: 'tv-hanging',
    label: 'Тумба подвесная',
    hint: '1800 × 350, на высоте 200 мм',
    make: () =>
      base('wall', 'Тумба подвесная', {
        w: 1800, h: 350, d: 400, lift: 200, drawerH: 280, handles: false,
        sections: [sec({ shelves: 0 }), sec({ drawers: 1, door: false }), sec({ shelves: 0 })],
      }),
  },
  {
    id: 'bookcase',
    label: 'Стеллаж открытый',
    hint: '400 × 2200, 5 полок',
    make: () => bookcase(0),
  },
  {
    id: 'dresser',
    label: 'Комод',
    hint: '1000 × 900, 4 ящика',
    make: () =>
      base('base', 'Комод', {
        w: 1000, h: 900, d: 450, plinth: 60, doorMode: 'none', drawerH: 200, handles: true,
        sections: [sec({ drawers: 4, door: false })],
      }),
  },
  {
    id: 'hall-wardrobe',
    label: 'Шкаф в прихожую',
    hint: '1000 × 2200 × 400, штанга и полки',
    make: () =>
      base('wardrobe', 'Шкаф в прихожую', {
        w: 1000, h: 2200, d: 400, plinth: 60, matCorpus: 'eg-w1000', matFacade: 'pm-u702',
        sections: [sec({ rod: true, shelves: 1 }), sec({ shelves: 5 })],
      }),
  },
  {
    id: 'shoe',
    label: 'Обувница',
    hint: '800 × 1000 × 320, 4 полки',
    make: () => base('base', 'Обувница', { w: 800, h: 1000, d: 320, plinth: 60, sections: [sec({ shelves: 4 }), sec({ shelves: 4 })] }),
  },
  {
    id: 'bedside',
    label: 'Тумба прикроватная',
    hint: '450 × 450 × 400, 2 ящика',
    make: () =>
      base('base', 'Тумба прикроватная', {
        w: 450, h: 450, d: 400, plinth: 50, doorMode: 'none', drawerH: 170,
        sections: [sec({ drawers: 2, door: false })],
      }),
  },
  {
    id: 'cargo',
    label: 'Бутылочница (карго)',
    hint: '200 × 820, выкатная корзина',
    make: () =>
      base('base', 'Бутылочница (карго)', {
        w: 200, h: 820, d: 560, plinth: 100, countertop: true, doorMode: 'none',
        sections: [sec({ drawers: 1, door: false })],
      }),
  },
  {
    id: 'filler',
    label: 'Фальшпланка нижняя (добор 50 мм)',
    hint: '50 × 820, для открывания дверей у стены',
    make: () =>
      base('base', 'Фальшпланка нижняя', {
        w: 50, h: 820, d: 560, plinth: 100, countertop: true, doorMode: 'none', handles: false,
        sections: [sec({ door: false })],
      }),
  },
  {
    id: 'filler-wall',
    label: 'Фальшпланка навесная (добор 50 мм)',
    hint: '50 × 720, для верхних шкафов к стене',
    make: () =>
      base('wall', 'Фальшпланка навесная', {
        w: 50, h: 720, d: 320, lift: 1420, doorMode: 'none', handles: false,
        sections: [sec({ door: false })],
      }),
  },
  {
    id: 'filler-tall',
    label: 'Фальшпланка шкафа/пенала (добор 50 мм)',
    hint: '50 × 2200, для шкафов и пеналов у стены',
    make: () =>
      base('tall', 'Фальшпланка шкафа', {
        w: 50, h: 2200, d: 560, plinth: 100, doorMode: 'none', handles: false,
        sections: [sec({ door: false })],
      }),
  },
  {
    id: 'filler-corner',
    label: 'Угловой добор 90° (50 × 50 мм)',
    hint: '50 × 820, для зазора дверей в углу кухни',
    make: () =>
      base('base', 'Угловой добор 90°', {
        w: 50, h: 820, d: 560, plinth: 100, countertop: true, doorMode: 'none', handles: false,
        sections: [sec({ door: false })],
      }),
  },
];

export function defaultProject() {
  return {
    v: 1 as const,
    id: uid(),
    name: 'Новый проект',
    updatedAt: Date.now(),
    modules: [],
    room: JSON.parse(JSON.stringify(DEFAULT_ROOM)),
  };
}
