import { generateKitchenLayout } from './kitchenWizard';
import type { RoomConfig } from './room';
import type { Kind, Module, Section } from './types';
import { uid } from './util';

export interface AiPromptResult {
  module: Module;
  modules?: Module[];
  room?: Partial<RoomConfig>;
  title: string;
  description: string;
  features: string[];
  dimensionsSummary: string;
}

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return { shelves: 0, drawers: 0, rod: rods > 0, rods, door: true, ...p };
};

/** Вспомогательная функция перевода единиц измерения в миллиметры */
function parseUnitToMm(valStr: string, unitStr?: string): number {
  const cleanVal = parseFloat(valStr.replace(',', '.'));
  if (isNaN(cleanVal)) return 0;
  const u = (unitStr ?? '').toLowerCase();
  if (u.startsWith('м') || u.startsWith('метр')) {
    return Math.round(cleanVal * 1000);
  }
  if (u.startsWith('см') || u.startsWith('сантиметр')) {
    return Math.round(cleanVal * 10);
  }
  if (valStr.includes('.') || valStr.includes(',')) {
    // Дробное число без единиц (например 2.4 или 1.8) -> считаем метрами
    return Math.round(cleanVal * 1000);
  }
  return Math.round(cleanVal);
}

/**
 * Интеллектуальный NLP-парсер текстовых запросов мебели на русском языке.
 * Распознает любые естественные формулировки:
 * - Размеры: 2.4м, 180см, 2400х1800х600, 2 метра, 3м
 * - Типы: шкаф-купе, распашной, подвесная ТВ-тумба, комод, обувница, пенал, кухня
 * - Количество дверей: 2 двери, 3-дверный, 4 створки, однодверный
 * - Наполнение: ящики, штанги, полки, ниши, зеркала
 * - Материалы и декоры: графит, кашемир, дуб сонома, белый премиум
 * - Фрезеровка и ручки: вельвет/рейки, рамка/классика, без ручек (push-to-open)
 */
export function parseFurniturePrompt(prompt: string): AiPromptResult {
  const text = prompt.toLowerCase().trim();
  const features: string[] = [];

  let w = 1200;
  let h = 2200;
  let d = 600;
  let customW = false;
  let customH = false;
  let customD = false;

  // 1. Поиск комплексных габаритов 3D: 2400х1800х600, 2.4м на 1.8м на 60см, 2400*1800*600, 2400 на 1800 на 600
  // 'на' не должно захватывать фразы вроде 'на 2 ящика' или 'на 3 полки'
  const notFeature = '(?!\\s*\\d+\\s*(?:выдвижн\\w*\\s*)?(?:ящик|двер|створк|полк|штанг|секц))';
  const sep = `(?:\\s*(?:[xх*×\\-]|на${notFeature})\\s*)`;

  const tripleRe = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(м|см|мм)?${sep}(\\d+(?:[.,]\\d+)?)\\s*(м|см|мм)?${sep}(\\d+(?:[.,]\\d+)?)\\s*(м|см|мм)?`,
    'i',
  );
  const triple = text.match(tripleRe);
  if (triple) {
    const n1 = parseUnitToMm(triple[1], triple[2]);
    const n2 = parseUnitToMm(triple[3], triple[4]);
    const n3 = parseUnitToMm(triple[5], triple[6]);
    if (n1 >= 1900 && n2 <= 1800) {
      h = n1; w = n2; d = n3;
    } else {
      w = n1; h = n2; d = n3;
    }
    customW = true; customH = true; customD = true;
  } else {
    // Двойной формат: 1800х600, 2.4м х 60см, 1800 на 600
    const dblRe = new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(м|см|мм)?${sep}(\\d+(?:[.,]\\d+)?)\\s*(м|см|мм)?`,
      'i',
    );
    const dbl = text.match(dblRe);
    if (dbl) {
      const n1 = parseUnitToMm(dbl[1], dbl[2]);
      const n2 = parseUnitToMm(dbl[3], dbl[4]);
      // Второй параметр должен быть валидной глубиной или высотой (не маленьким счетчиком без единиц)
      if (dbl[4] || n2 >= 200 || dbl[3].includes('.') || dbl[3].includes(',')) {
        if (n1 >= 1900) {
          h = n1; w = n2; customH = true; customW = true;
        } else {
          w = n1; d = n2; customW = true; customD = true;
        }
      }
    }

    // Именованные габариты: "ширина 2.4м", "высотой 2500мм", "глубина 60см"
    const wMatch = text.match(/(?:ширин[аеыу]?|длин[аеыу]?|ш\s*[:=])\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(м|см|мм)?/i);
    if (wMatch) {
      w = parseUnitToMm(wMatch[1], wMatch[2]);
      customW = true;
    }

    const hMatch = text.match(/(?:высот[аеыу]?|в\s*[:=])\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(м|см|мм)?/i);
    if (hMatch) {
      h = parseUnitToMm(hMatch[1], hMatch[2]);
      customH = true;
    }

    const dMatch = text.match(/(?:глубин[аеыу]?|г\s*[:=])\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(м|см|мм)?/i);
    if (dMatch) {
      d = parseUnitToMm(dMatch[1], dMatch[2]);
      customD = true;
    }

    // Одиночные метры / сантиметры (например: "шкаф 2.4м", "кухня 3 метра")
    if (!customW) {
      const singleMeterMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:м|метр(?:а|ов)?)\b/i);
      if (singleMeterMatch) {
        w = parseUnitToMm(singleMeterMatch[1], 'м');
        customW = true;
      }
    }
  }

  // Запрос "до потолка"
  if (/до потолк/i.test(text)) {
    h = 2650;
    customH = true;
    features.push('Высота в потолок (2650 мм)');
  }

  // 2. Двери и створки
  let requestedDoors: number | null = null;
  const doorNumMatch = text.match(/(\d+)\s*(?:двер|створ)/i);
  if (doorNumMatch) {
    requestedDoors = Math.min(6, Math.max(1, Number(doorNumMatch[1])));
  } else if (/однодверн|одноствор/i.test(text)) {
    requestedDoors = 1;
  } else if (/двухдверн|двухствор/i.test(text)) {
    requestedDoors = 2;
  } else if (/трехдверн|трёхдверн|трехствор/i.test(text)) {
    requestedDoors = 3;
  } else if (/четырехдверн|четырёхдверн|четырехствор/i.test(text)) {
    requestedDoors = 4;
  }

  // 3. Определение типа мебели
  let kind: Kind = 'wardrobe';
  let doorMode: 'none' | 'hinged' | 'sliding' = 'hinged';
  let slidingCount = 2;
  let countertop = false;
  let lift = 0;
  let plinth = 100;
  let name = 'Шкаф распашной';
  const isKitchen = /кухн|кухонн|гарнитур/i.test(text);

  if (isKitchen) {
    kind = 'base';
    countertop = true;
    if (!customW) w = 2400;
    if (!customH) h = 860;
    if (!customD) d = 600;
    name = `Кухонный гарнитур ${w} мм`;
    features.push('Кухонный комплект: нижние тумбы + столешница');
  } else if (/купе|слайд|раздвижн/i.test(text)) {
    kind = 'wardrobe';
    doorMode = 'sliding';
    slidingCount = requestedDoors ?? (w >= 2100 ? 3 : 2);
    if (!customH) h = 2400;
    if (!customD) d = 600;
    name = `Шкаф-купе ${w}×${h} мм`;
    features.push(`Раздвижная система (${slidingCount} двери-купе)`);
  } else if (/комод/i.test(text)) {
    kind = 'base';
    countertop = true;
    doorMode = 'none';
    if (!customW) w = 1000;
    if (!customH) h = 900;
    if (!customD) d = 450;
    name = `Комод ${w}×${h} мм`;
    features.push('Конфигурация комода с выдвижными ящиками');
  } else if (/тв|tv|тумб|под телевизор|консол/i.test(text)) {
    kind = 'base';
    countertop = true;
    if (!customW) w = 1800;
    if (!customH) h = 450;
    if (!customD) d = 400;
    name = `Тумба под ТВ ${w} мм`;
    features.push('ТВ-тумба с усиленной верхней панелью');
  } else if (/пенал|колонн/i.test(text)) {
    kind = 'tall';
    if (!customW) w = 600;
    if (!customH) h = 2200;
    if (!customD) d = 560;
    name = `Пенал ${w}×${h} мм`;
    features.push('Пенал для кухни / хранения');
  } else if (/обувниц|калошниц/i.test(text)) {
    kind = 'base';
    countertop = true;
    if (!customW) w = 800;
    if (!customH) h = 1000;
    if (!customD) d = 320;
    name = `Обувница ${w}×${h} мм`;
    features.push('Компактная обувница для прихожей');
  } else if (/стеллаж|книжн|библиотек|открыт/i.test(text)) {
    kind = 'wardrobe';
    doorMode = 'none';
    if (!customW) w = 800;
    if (!customH) h = 2200;
    if (!customD) d = 350;
    name = `Стеллаж ${w}×${h} мм`;
    features.push('Открытый стеллаж с полками');
  } else {
    // Обычный распашной шкаф
    if (!customH) h = 2300;
    if (!customD) d = 580;
    name = `Шкаф ${w}×${h} мм`;
  }

  // Подвесная конструкция (парящая)
  if (/подвесн|парящ|настенн|без цокол|без ножек/i.test(text)) {
    lift = 250;
    plinth = 0;
    features.push('Подвесная конструкция (монтаж на стену)');
  }

  // 4. Анализ внутреннего наполнения (ящики, полки, штанги)
  let drawersCount = 0;
  const drawMatch = text.match(/(\d+)\s*(?:выдвижн\w*)?\s*ящик/i);
  if (drawMatch) {
    drawersCount = Math.min(8, Number(drawMatch[1]));
  } else if (/ящик/i.test(text)) {
    drawersCount = kind === 'base' ? 4 : 2;
  }

  let shelvesCount = 2;
  const shelfMatch = text.match(/(\d+)\s*пол[ок|ки|ка]/i);
  if (shelfMatch) {
    shelvesCount = Math.min(10, Number(shelfMatch[1]));
  } else if (/стеллаж/i.test(text)) {
    shelvesCount = 5;
  }

  let rodsCount = 0;
  const rodMatch = text.match(/(\d+)\s*штанг/i);
  if (rodMatch) {
    rodsCount = Math.min(3, Number(rodMatch[1]));
  } else if (/штанг|одежд|плечик|вешалк/i.test(text) && kind === 'wardrobe') {
    rodsCount = 1;
  }

  if (drawersCount > 0) features.push(`Выдвижные ящики: ${drawersCount} шт`);
  if (shelvesCount > 0) features.push(`Полки: ${shelvesCount} шт`);
  if (rodsCount > 0) features.push(`Штанги для одежды: ${rodsCount} шт`);

  // 5. Количество секций
  let numSections = 1;
  if (requestedDoors) {
    numSections = requestedDoors;
  } else if (doorMode === 'sliding') {
    numSections = slidingCount;
  } else if (kind === 'wardrobe') {
    numSections = w >= 2100 ? 3 : w >= 1400 ? 2 : 1;
  }

  const sections: Section[] = [];
  for (let s = 0; s < numSections; s++) {
    if (numSections === 1) {
      sections.push(sec({
        shelves: shelvesCount,
        drawers: drawersCount,
        rods: rodsCount,
        rod: rodsCount > 0,
        door: doorMode !== 'none',
      }));
    } else if (s === 0) {
      // Первая секция: ящики + полки
      sections.push(sec({
        shelves: Math.max(1, Math.round(shelvesCount / 2)),
        drawers: drawersCount,
        rods: 0,
        rod: false,
        door: doorMode !== 'none',
      }));
    } else {
      // Вторая/третья секция: штанга + полка
      sections.push(sec({
        shelves: Math.max(1, Math.floor(shelvesCount / 2)),
        drawers: 0,
        rods: rodsCount > 0 ? rodsCount : 1,
        rod: true,
        door: doorMode !== 'none',
      }));
    }
  }

  // 6. Материалы и декоры
  let matFacade = 'eg-w1000';
  let matCorpus = 'eg-w1000';
  let matTop = 'top-f812';

  if (/графит|черн|антрацит|темн/i.test(text)) {
    matFacade = 'eg-u999';
    matCorpus = 'eg-u999';
    matTop = 'top-f206';
    features.push('Цвет: Графит глубокий матовый');
  } else if (/кашемир|бежев|песочн|крем|латте/i.test(text)) {
    matFacade = 'eg-u702';
    matCorpus = 'eg-u702';
    features.push('Цвет: Кашемир серый / бежевый');
  } else if (/галифакс/i.test(text)) {
    matFacade = 'eg-h1180';
    matCorpus = 'eg-w1000';
    matTop = 'top-h1180';
    features.push('Фасады: Дуб Галифакс натуральный');
  } else if (/дуб|дерев|соном|эко/i.test(text)) {
    matFacade = 'eg-h3303';
    matCorpus = 'eg-w1000';
    features.push('Фасады: Текстурированный дуб сонома');
  } else if (/крафт|орех|хикори|вотан/i.test(text)) {
    matFacade = 'eg-h3730';
    matCorpus = 'eg-w1000';
    features.push('Фасады: Натуральный дуб хикори');
  } else if (/изумруд|зелен|фьорд/i.test(text)) {
    matFacade = 'm-emerald';
    matCorpus = 'eg-w1000';
    features.push('Фасады: МДФ Эмаль Изумруд');
  } else {
    features.push('Цвет: Белый премиум (EGGER W1000)');
  }

  const hasMirror = /зеркал|зеркальн/i.test(text);
  if (hasMirror) {
    matFacade = 'm-mirror';
    features.push('Зеркальные фасады');
  }

  // 7. Ручки, фрезеровка и верхняя планка (карниз)
  let handles = true;
  let milling: 'modern' | 'frame' | 'ribbed' = 'modern';
  const wantsTopTrim = /карниз|верхн\w*\s*планк|до потолк|под потолок/i.test(text);

  if (/без ручек|push|нажат|скрыт|интегрирован|tip-on/i.test(text)) {
    handles = false;
    features.push('Открывание Push-to-open (без ручек)');
  }
  if (/рамк|шакер|классик/i.test(text)) {
    milling = 'frame';
    features.push('Фрезеровка: Классическая рамка');
  } else if (/вельвет|рифлен|рейк|рейчат/i.test(text)) {
    milling = 'ribbed';
    features.push('Фрезеровка: Рифлёный вельвет');
  }
  if (wantsTopTrim) {
    features.push('Цельная верхняя доборная планка (карниз 60 мм)');
  }

  const primaryModule: Module = {
    id: uid(),
    name,
    kind,
    x: 0,
    w,
    h,
    d,
    t: 16,
    lift,
    plinth,
    countertop,
    doorMode,
    slidingCount,
    hinge: 'right',
    sections,
    drawerH: 200,
    handles,
    milling,
    plinthColor: 'facade',
    mirror: hasMirror,
    matCorpus,
    matFacade,
    matBack: 'b-white',
    matTop,
    ...(wantsTopTrim && kind !== 'base' ? { topTrim: 60 } : {}),
  };

  // Специальный генератор Г-образной кухни по эскизу (3930 × 1920 × 2770, левое крыло с пеналами + невстроенный холодильник)
  if (/эскиз|3930/i.test(text)) {
    const mk = (o: Partial<Module> & { name: string; kind: Kind; x: number; w: number; h: number; d: number }): Module => ({
      id: uid(),
      mirror: false,
      plinth: o.kind === 'wall' ? 0 : 100,
      lift: 0,
      t: 16,
      sections: [sec()],
      doorMode: 'hinged',
      slidingCount: 2,
      drawerH: 200,
      handles: true,
      countertop: false,
      matCorpus: matCorpus || 'eg-w1000',
      matFacade: matFacade || 'pm-u702',
      matBack: 'b-white',
      matTop: matTop || 'top-f812',
      milling: milling === 'modern' ? 'modern' : milling,
      plinthColor: 'facade',
      ...o,
    });

    const sketchModules: Module[] = [
      // Задняя стена 3930 мм — нижний ярус (глубина 500 мм):
      // 0..1230: угловая прямая мойка (500 утоплено в левый угол + 30 мм планка от удара дверей + 700 мм фасад мойки)
      mk({ name: 'Модуль под мойку (угловой)', kind: 'base', x: 0, w: 1230, h: 820, d: 500, countertop: true, blindSide: 'left', blindW: 530, blindFillerW: 30, sections: [sec({ shelves: 0 })] }),
      mk({ name: 'Модуль с 2 ящиками', kind: 'base', x: 1230, w: 600, h: 820, d: 500, countertop: true, doorMode: 'none', drawerH: 355, sections: [sec({ drawers: 2, door: false })] }),
      mk({ name: 'Модуль под варочную поверхность', kind: 'base', x: 1830, w: 600, h: 820, d: 500, countertop: true, doorMode: 'none', drawerH: 355, sections: [sec({ drawers: 2, door: false })] }),
      mk({ name: 'Модуль с 3 ящиками', kind: 'base', x: 2430, w: 450, h: 820, d: 500, countertop: true, doorMode: 'none', drawerH: 238, sections: [sec({ drawers: 3, door: false })] }),
      mk({ name: 'Нижний модуль (полки)', kind: 'base', x: 2880, w: 450, h: 820, d: 500, countertop: true, sections: [sec({ shelves: 1 })] }),
      mk({ name: 'Холодильник (невстроенный)', kind: 'tall', x: 3330, w: 600, h: 2050, d: 600, plinth: 0, doorMode: 'none', sections: [sec({ shelves: 0, door: false })] }),
      mk({ name: 'Антресоль над холодильником', kind: 'wall', x: 3330, w: 600, h: 530, d: 500, lift: 2070, hinge: 'top', topTrim: 60, sections: [sec({ shelves: 0 })] }),

      // Задняя стена — верхний ярус (800 мм, глубина 300 мм):
      // 0..1030: угловая сушка для посуды 2 двери (300 утоплено за боковой шкаф + 30 мм планка + 700 мм 2 дверцы сушки)
      mk({ name: 'Сушка для посуды угловая (2 двери)', kind: 'wall', x: 0, w: 1030, h: 800, d: 300, lift: 1400, blindSide: 'left', blindW: 330, blindFillerW: 30, sections: [sec({ shelves: 2 })] }),
      mk({ name: 'Верхний шкаф (стыковой)', kind: 'wall', x: 1030, w: 200, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 2 })] }),
      mk({ name: 'Верхний шкаф', kind: 'wall', x: 1230, w: 600, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 2 })] }),
      mk({ name: 'Шкаф под встроенную вытяжку', kind: 'wall', x: 1830, w: 600, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 1 })] }),
      mk({ name: 'Верхний шкаф', kind: 'wall', x: 2430, w: 450, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 2 })] }),
      mk({ name: 'Верхний шкаф', kind: 'wall', x: 2880, w: 450, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 2 })] }),

      // Задняя стена — антресоли (400 мм, глубина 300 мм вровень с верхними шкафами) + карниз 60 мм
      ...[
        [0, 1030], [1030, 200], [1230, 600], [1830, 600], [2430, 450], [2880, 450],
      ].map(([ax, aw], idx) =>
        mk({
          name: `Антресоль ${idx + 1}`,
          kind: 'wall', x: ax, w: aw, h: 400, d: 300, lift: 2200, hinge: 'top', topTrim: 60, handles: false,
          ...(idx === 0 ? { blindSide: 'left' as const, blindW: 330, blindFillerW: 30 } : {}),
          sections: [sec({ shelves: 0 })],
        }),
      ),

      // Левое крыло (Г-угол налево, стена 1920 мм, глубина 500 мм):
      // Низ 500..820 упирается в 30-мм планку угловой мойки; Верх 300..820 упирается в 30-мм планку угловой сушки!
      mk({ name: 'Нижний шкаф (левое крыло)', kind: 'base', wall: 'left', x: 500, w: 320, h: 820, d: 500, countertop: true, sections: [sec({ shelves: 1 })] }),
      mk({ name: 'Верхний шкаф (левое крыло)', kind: 'wall', wall: 'left', x: 300, w: 520, h: 800, d: 300, lift: 1400, sections: [sec({ shelves: 2 })] }),
      mk({ name: 'Антресоль (левое крыло)', kind: 'wall', wall: 'left', x: 300, w: 520, h: 400, d: 300, lift: 2200, hinge: 'top', topTrim: 60, handles: false, sections: [sec({ shelves: 0 })] }),
      mk({ name: 'Пенал с нишей под духовку/СВЧ', kind: 'tall', wall: 'left', x: 820, w: 600, h: 2600, d: 500, plinth: 100, drawerH: 360, topTrim: 60, sections: [sec({ drawers: 1, shelves: 4 })] }),
      mk({ name: 'Пенал 500 (полки)', kind: 'tall', wall: 'left', x: 1420, w: 500, h: 2600, d: 500, plinth: 100, topTrim: 60, sections: [sec({ shelves: 6 })] }),
    ];

    return {
      module: sketchModules[0],
      modules: sketchModules,
      room: { w: 3930, d: 1920, h: 2770 },
      title: 'Кухня Г-образная по эскизу (3930 × 1920 мм)',
      description: 'Комната 3930×1920×2770 · Задняя стена (мойка 700, варка 600, ящики, холодильник 600) + Левое крыло (пеналы 500 + 600 под духовку/СВЧ)',
      features: [
        'Комната: 3930 × 1920 × 2770 мм',
        'Невстроенный холодильник 600 мм (без ЛДСП)',
        'Левое крыло: пенал 500 + пенал духовка/СВЧ 600',
        '3 яруса (верх 800 + антресоль 400 + карниз 60)',
      ],
      dimensionsSummary: '3930 × 1920 × 2770 мм',
    };
  }

  // Если запрос на кухню — формируем сбалансированный кухонный гарнитур по стандартам технолога
  let kitchenModules: Module[] | undefined;
  if (isKitchen && w >= 1200) {
    const wantsThreeTiers = /антресол|до потолка|3\s*ярус|трехъярус|трёхъярус|высок/i.test(text) || h >= 2400;
    const wantsCorner = /углов|г-образ|г образ/i.test(text);
    const wantsNoTall = /без пенал/i.test(text);
    const wantsTallRight = /пенал справ/i.test(text);
    const layoutVariant = wantsNoTall ? 2 : wantsTallRight ? 1 : 0;

    kitchenModules = generateKitchenLayout({
      wallLength: Math.max(1600, w),
      tiers: wantsThreeTiers ? 3 : 2,
      facadeMat: matFacade,
      corpusMat: matCorpus,
      topMat: matTop,
      plinthColor: 'facade',
      millingMix: milling === 'modern' && wantsThreeTiers ? 'trend' : milling,
      layoutVariant,
      shape: wantsCorner ? 'corner-left' : 'linear',
      topTrimH: wantsTopTrim || wantsThreeTiers ? 60 : 0,
    });

    if (!handles) {
      kitchenModules.forEach((km) => { km.handles = false; });
    }
  }

  const dimensionsSummary = `${w} × ${h} × ${d} мм`;
  features.unshift(`Габариты: ${dimensionsSummary}`);

  const title = `AI-Генерация: ${name}`;
  const description = `Параметрический проект: ${features.slice(0, 4).join(' · ')}`;

  return {
    module: primaryModule,
    modules: kitchenModules,
    title,
    description,
    features,
    dimensionsSummary,
  };
}
