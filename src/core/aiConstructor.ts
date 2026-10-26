import type { Kind, Module, Section } from './types';
import { uid } from './util';

export interface AiPromptResult {
  module: Module;
  title: string;
  description: string;
  features: string[];
}

const sec = (p: Partial<Section> = {}): Section => {
  const rods = p.rods ?? (p.rod ? 1 : 0);
  return { shelves: 0, drawers: 0, rod: rods > 0, rods, door: true, ...p };
};

/**
 * Интеллектуальный NLP-парсер текстовых запросов мебели на русском языке.
 * Извлекает габариты, тип мебели, наполнение, фурнитуру и материалы,
 * генерируя готовую параметрическую 3D-модель для производства.
 */
export function parseFurniturePrompt(prompt: string): AiPromptResult {
  const text = prompt.toLowerCase().trim();
  const features: string[] = [];

  // 1. Поиск габаритов: W x H x D, H x W x D или отдельные числа
  let w = 1200;
  let h = 2200;
  let d = 600;
  let customW = false;
  let customH = false;
  let customD = false;

  // Формат 2400x1800x600 или 1800*2400*600
  const triple = text.match(/(\d{3,4})\s*[xх*×]\s*(\d{3,4})\s*[xх*×]\s*(\d{3,4})/);
  if (triple) {
    const [_, n1, n2, n3] = triple.map(Number);
    // Если первое число больше 1900, а второе меньше, часто это ВхШхГ
    if (n1 >= 1900 && n2 <= 1800) {
      h = n1; w = n2; d = n3;
    } else {
      w = n1; h = n2; d = n3;
    }
    customW = true; customH = true; customD = true;
    features.push(`Габариты: ${w} × ${h} × ${d} мм`);
  } else {
    // Формат 1800х600 (двумерный)
    const dbl = text.match(/(\d{3,4})\s*[xх*×]\s*(\d{3,4})/);
    if (dbl) {
      const [_, n1, n2] = dbl.map(Number);
      if (n1 >= 1900) {
        h = n1; w = n2; customH = true; customW = true;
      } else {
        w = n1; d = n2; customW = true; customD = true;
      }
    }

    // Отдельные ключевые слова
    const wMatch = text.match(/ширин[аеыу]?\s*[:=]?\s*(\d{3,4})/);
    if (wMatch) { w = Number(wMatch[1]); customW = true; }

    const hMatch = text.match(/высот[аеыу]?\s*[:=]?\s*(\d{3,4})/);
    if (hMatch) { h = Number(hMatch[1]); customH = true; }

    const dMatch = text.match(/глубин[аеыу]?\s*[:=]?\s*(\d{3,4})/);
    if (dMatch) { d = Number(dMatch[1]); customD = true; }

    // Числа с мм (например "1800 мм" или "1800мм")
    const mmMatch = text.match(/(\d{3,4})\s*(?:мм|см)/);
    if (mmMatch && !customW) {
      w = Number(mmMatch[1]);
      customW = true;
    }
  }

  // 2. Определение типа мебели
  let kind: Kind = 'wardrobe';
  let doorMode: 'none' | 'hinged' | 'sliding' = 'hinged';
  let slidingCount = 2;
  let countertop = false;
  let lift = 0;
  let plinth = 100;
  let name = 'Шкаф распашной';

  if (/купе|слайд|раздвижн/i.test(text)) {
    kind = 'wardrobe';
    doorMode = 'sliding';
    slidingCount = w >= 2100 ? 3 : 2;
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
  } else if (/тв|tv|тумб|под телевизор/i.test(text)) {
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
    features.push('Пенал для кухни/хранения');
  } else if (/обувниц|калошниц/i.test(text)) {
    kind = 'base';
    countertop = true;
    if (!customW) w = 800;
    if (!customH) h = 1000;
    if (!customD) d = 320;
    name = `Обувница ${w}×${h} мм`;
    features.push('Компактная обувница для прихожей');
  } else if (/стеллаж|книжн|библиотек/i.test(text)) {
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

  // 3. Анализ внутреннего наполнения (ящики, полки, штанги)
  let drawersCount = 0;
  const drawMatch = text.match(/(\d+)\s*(?:выдвижн\w*)?\s*ящик/);
  if (drawMatch) {
    drawersCount = Math.min(8, Number(drawMatch[1]));
  } else if (/ящик/i.test(text)) {
    drawersCount = kind === 'base' ? 4 : 2;
  }

  let shelvesCount = 2;
  const shelfMatch = text.match(/(\d+)\s*пол[ок|ки|ка]/);
  if (shelfMatch) {
    shelvesCount = Math.min(10, Number(shelfMatch[1]));
  } else if (/стеллаж/i.test(text)) {
    shelvesCount = 5;
  }

  let rodsCount = 0;
  const rodMatch = text.match(/(\d+)\s*штанг/);
  if (rodMatch) {
    rodsCount = Math.min(3, Number(rodMatch[1]));
  } else if (/штанг|одежд|плечик|вешалк/i.test(text) && kind === 'wardrobe') {
    rodsCount = 1;
  }

  if (drawersCount > 0) features.push(`Выдвижные ящики: ${drawersCount} шт`);
  if (shelvesCount > 0) features.push(`Полки: ${shelvesCount} шт`);
  if (rodsCount > 0) features.push(`Штанги для одежды: ${rodsCount} шт`);

  // Секции
  const numSections = w >= 1600 ? (w >= 2400 ? 3 : 2) : 1;
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
      // Вторая/третья секция: штанга + полки
      sections.push(sec({
        shelves: Math.max(1, Math.floor(shelvesCount / 2)),
        drawers: 0,
        rods: rodsCount > 0 ? rodsCount : 1,
        rod: true,
        door: doorMode !== 'none',
      }));
    }
  }

  // 4. Материалы и цвета
  let matFacade = 'eg-w1000'; // по умолчанию белый премиум
  let matCorpus = 'eg-w1000';
  let matTop = 'top-f812';

  if (/графит|черн|антрацит|темн/i.test(text)) {
    matFacade = 'eg-u999';
    matCorpus = 'eg-u999';
    features.push('Цвет: Графит глубокий матовый');
  } else if (/кашемир|бежев|песочн|крем/i.test(text)) {
    matFacade = 'eg-u702';
    matCorpus = 'eg-u702';
    features.push('Цвет: Кашемир серый / бежевый');
  } else if (/дуб|дерев|соном|орех|эко/i.test(text)) {
    matFacade = 'eg-h3303';
    matCorpus = 'eg-w1000';
    features.push('Фасады: Текстурированный дуб сонома');
  } else {
    features.push('Цвет: Белый премиум (EGGER W1000)');
  }

  if (/зеркал|зеркальн/i.test(text)) {
    matFacade = 'm-mirror';
    features.push('Зеркальные фасады');
  }

  // Ручки / фрезеровка
  let handles = true;
  let milling: 'modern' | 'frame' | 'ribbed' = 'modern';

  if (/без ручек|push|нажат|скрыт|интегрирован/i.test(text)) {
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

  const module: Module = {
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
    mirror: matFacade === 'm-mirror',
    matCorpus,
    matFacade,
    matBack: 'b-white',
    matTop,
  };

  const title = `AI-Генерация: ${name}`;
  const description = `Параметрический модуль создан по описанию: ${features.join(' · ')}`;

  return { module, title, description, features };
}
