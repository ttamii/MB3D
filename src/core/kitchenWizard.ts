import type { Module, Section } from './types';
import { uid } from './util';

export interface KitchenWizardOptions {
  wallLength: number; // мм (например 2400, 3000, 3600)
  tiers: 2 | 3;       // 2 яруса (низ + верх) или 3 яруса (низ + верх + антресоли)
  facadeMat: string;  // id материала фасадов (по умолчанию 'm-ral1015' - Нежный беж)
  corpusMat: string;  // id материала корпуса (по умолчанию 'eg-w1000' - Белый премиум)
  topMat: string;     // id столешницы (по умолчанию 'top-f812' - Мрамор Леванто)
  plinthColor: 'facade' | 'corpus';
  millingMix: 'trend' | 'modern' | 'frame' | 'ribbed'; // 'trend' = внизу рамка, вверху модерн, антресоль рифлёная
  layoutVariant: number; // 0: пенал слева, 1: пенал справа, 2: без пенала (симметричная)
}

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return {
    shelves: 0,
    drawers: 0,
    rod: rods > 0,
    rods,
    door: true,
    ...p,
  };
};

export function generateKitchenLayout(opts: KitchenWizardOptions): Module[] {
  const {
    wallLength,
    tiers,
    facadeMat,
    corpusMat,
    topMat,
    plinthColor,
    millingMix,
    layoutVariant,
  } = opts;

  const modules: Module[] = [];
  const W_TOTAL = Math.max(1600, wallLength);
  const hasTall = layoutVariant !== 2 && W_TOTAL >= 2200;
  const tallW = 600;
  const workW = hasTall ? W_TOTAL - tallW : W_TOTAL;

  // Определение стилей фрезеровки по ярусам
  const bottomMilling = millingMix === 'trend' ? 'frame' : millingMix;
  const upperMilling = millingMix === 'trend' ? 'modern' : millingMix;
  const mezzMilling = millingMix === 'trend' ? 'ribbed' : millingMix;

  // Разбиваем рабочую зону на модули (шириной от 400 до 800 мм, стандарт 600)
  const numBase = Math.max(2, Math.round(workW / 600));
  const baseW = Math.round(workW / numBase);

  // Смещение начала рабочей зоны
  const tallAtLeft = hasTall && layoutVariant === 0;
  const workStartX = tallAtLeft ? tallW : 0;
  const tallX = tallAtLeft ? 0 : workW;

  // 1. Пенал (если включен)
  if (hasTall) {
    modules.push({
      id: uid(),
      name: 'Пенал с нишей под духовку/СВЧ',
      kind: 'tall',
      x: tallX,
      mirror: false,
      hinge: 'right',
      w: tallW,
      h: tiers === 3 ? 2530 : 2170,
      d: 560,
      plinth: 100,
      lift: 0,
      t: 16,
      sections: [
        sec({ drawers: 1, shelves: 3, door: true }),
      ],
      doorMode: 'hinged',
      slidingCount: 2,
      drawerH: 200,
      handles: true,
      countertop: false,
      matCorpus: corpusMat,
      matFacade: facadeMat,
      matBack: 'b-white',
      matTop: topMat,
      milling: bottomMilling,
      plinthColor,
    });
  }

  // 2. Нижний ярус и верхний ярус
  for (let i = 0; i < numBase; i++) {
    const curW = i === numBase - 1 ? (workW - i * baseW) : baseW;
    const curX = workStartX + i * baseW;

    // Роли нижних модулей:
    // i = 0 (или 1): Мойка
    // i = 1 (или 2): 3 выдвижных ящика
    // i = 2 (или 3): Варочная поверхность / духовка
    // остальные: распашные с полкой
    let baseName = `Нижний шкаф ${i + 1}`;
    let baseSections = [sec({ shelves: 1, door: true })];
    let baseDoorMode: 'none' | 'hinged' = 'hinged';
    let baseDrH = 200;

    let upperName = `Верхний шкаф ${i + 1}`;
    let upperSections = [sec({ shelves: 2, door: true })];

    if (i === 0) {
      baseName = 'Модуль под мойку';
      baseSections = [sec({ shelves: 0, door: true })];
      upperName = 'Сушка для посуды (2 яруса)';
    } else if (i === 1) {
      baseName = 'Модуль с 3 ящиками (приборы + кастрюли)';
      baseSections = [sec({ drawers: 3, door: false })];
      baseDoorMode = 'none';
      baseDrH = 240;
    } else if (i === 2 && numBase >= 3) {
      baseName = 'Модуль под варочную поверхность';
      baseSections = [sec({ shelves: 1, drawers: 1, door: false })];
      baseDoorMode = 'none';
      baseDrH = 160;
      upperName = 'Шкаф под вытяжку';
    }

    // Добавляем нижний модуль
    modules.push({
      id: uid(),
      name: baseName,
      kind: 'base',
      x: curX,
      mirror: false,
      w: curW,
      h: 820,
      d: 560,
      plinth: 100,
      lift: 0,
      t: 16,
      sections: baseSections,
      doorMode: baseDoorMode,
      slidingCount: 2,
      drawerH: baseDrH,
      handles: true,
      countertop: true,
      matCorpus: corpusMat,
      matFacade: facadeMat,
      matBack: 'b-white',
      matTop: topMat,
      milling: bottomMilling,
      plinthColor,
    });

    // Добавляем верхний модуль (2-й ярус)
    modules.push({
      id: uid(),
      name: upperName,
      kind: 'wall',
      x: curX,
      mirror: false,
      w: curW,
      h: 720,
      d: 320,
      plinth: 0,
      lift: 1450,
      t: 16,
      sections: upperSections,
      doorMode: 'hinged',
      slidingCount: 2,
      drawerH: 200,
      handles: true,
      countertop: false,
      matCorpus: corpusMat,
      matFacade: facadeMat,
      matBack: 'b-white',
      matTop: topMat,
      milling: upperMilling,
    });

    // 3. Антресоли (3-й ярус, под потолок)
    if (tiers === 3) {
      modules.push({
        id: uid(),
        name: `Антресоль ${i + 1} (push-to-open)`,
        kind: 'wall',
        x: curX,
        mirror: false,
        w: curW,
        h: 360,
        d: 560, // глубокая антресоль вровень с пеналом!
        plinth: 0,
        lift: 2170,
        t: 16,
        sections: [sec({ shelves: 0, door: true })],
        doorMode: 'hinged',
        slidingCount: 2,
        drawerH: 200,
        handles: false, // push-to-open
        countertop: false,
        matCorpus: corpusMat,
        matFacade: facadeMat,
        matBack: 'b-white',
        matTop: topMat,
        milling: mezzMilling, // рифлёная
      });
    }
  }

  return modules;
}
