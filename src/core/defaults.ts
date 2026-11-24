import type { HardwareItem, Kind, Material, Module, Section, Settings } from './types';
import { DEFAULT_ROOM } from './room';
import { uid } from './util';

export const BRAND = 'ADAL Constructor';

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
  // ——— 1. ЛДСП EGGER: Древесные (Feelwood / Синхронные поры ST10..ST37) ———
  { id: 'eg-h1180', name: 'EGGER H1180 ST37 Дуб Галифакс натуральный', kind: 'sheet', color: '#b58a5c', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h1181', name: 'EGGER H1181 ST37 Дуб Галифакс табак', kind: 'sheet', color: '#6b4f3b', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h1176', name: 'EGGER H1176 ST37 Дуб Галифакс белый', kind: 'sheet', color: '#cfc4b6', grain: true, category: 'EGGER Древесные', price: 6800 },
  { id: 'eg-h3176', name: 'EGGER H3176 ST37 Дуб Галифакс олово', kind: 'sheet', color: '#9c856b', grain: true, category: 'EGGER Древесные', price: 6900 },
  { id: 'eg-h1385', name: 'EGGER H1385 ST40 Дуб Каселла натуральный', kind: 'sheet', color: '#bf9d78', grain: true, category: 'EGGER Древесные', price: 6600 },
  { id: 'eg-h1386', name: 'EGGER H1386 ST40 Дуб Каселла коричневый', kind: 'sheet', color: '#785a43', grain: true, category: 'EGGER Древесные', price: 6600 },
  { id: 'eg-h3303', name: 'EGGER H3303 ST10 Дуб Гамильтон натуральный', kind: 'sheet', color: '#bfa280', grain: true, category: 'EGGER Древесные', price: 5900 },
  { id: 'eg-h3331', name: 'EGGER H3331 ST10 Дуб Небраска натуральный', kind: 'sheet', color: '#b99b79', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h3332', name: 'EGGER H3332 ST10 Дуб Небраска серый', kind: 'sheet', color: '#8a8279', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h3398', name: 'EGGER H3398 ST12 Дуб Кендал коньяк', kind: 'sheet', color: '#a87d54', grain: true, category: 'EGGER Древесные', price: 5800 },
  { id: 'eg-h3133', name: 'EGGER H3133 ST12 Дуб Давос трюфель', kind: 'sheet', color: '#78685a', grain: true, category: 'EGGER Древесные', price: 5800 },
  { id: 'eg-h1145', name: 'EGGER H1145 ST10 Дуб Бардолино натуральный', kind: 'sheet', color: '#c8b398', grain: true, category: 'EGGER Древесные', price: 5400 },
  { id: 'eg-h1146', name: 'EGGER H1146 ST10 Дуб Бардолино серый', kind: 'sheet', color: '#9c958c', grain: true, category: 'EGGER Древесные', price: 5400 },
  { id: 'eg-h3157', name: 'EGGER H3157 ST12 Дуб Винченца', kind: 'sheet', color: '#ab937a', grain: true, category: 'EGGER Древесные', price: 5500 },
  { id: 'eg-h3158', name: 'EGGER H3158 ST19 Дуб Винченца выбеленный', kind: 'sheet', color: '#c7b9a6', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h1344', name: 'EGGER H1344 ST32 Дуб Шерман коньяк', kind: 'sheet', color: '#845d42', grain: true, category: 'EGGER Древесные', price: 6200 },
  { id: 'eg-h1346', name: 'EGGER H1346 ST32 Дуб Шерман антрацит', kind: 'sheet', color: '#4d4844', grain: true, category: 'EGGER Древесные', price: 6200 },
  { id: 'eg-h3734', name: 'EGGER H3734 ST9 Орех Дижон натуральный', kind: 'sheet', color: '#654a3a', grain: true, category: 'EGGER Древесные', price: 5900 },
  { id: 'eg-h3700', name: 'EGGER H3700 ST10 Орех Пасифик натуральный', kind: 'sheet', color: '#745a49', grain: true, category: 'EGGER Древесные', price: 5700 },
  { id: 'eg-h3710', name: 'EGGER H3710 ST12 Орех Карини натуральный', kind: 'sheet', color: '#6b4e3d', grain: true, category: 'EGGER Древесные', price: 5900 },
  { id: 'eg-h3730', name: 'EGGER H3730 ST10 Гикори натуральный', kind: 'sheet', color: '#9c7a54', grain: true, category: 'EGGER Древесные', price: 5800 },
  { id: 'eg-h1250', name: 'EGGER H1250 ST36 Ясень Наварра', kind: 'sheet', color: '#ccbda9', grain: true, category: 'EGGER Древесные', price: 5600 },
  { id: 'eg-h1212', name: 'EGGER H1212 ST33 Вяз Тоссини коричневый', kind: 'sheet', color: '#7a5d48', grain: true, category: 'EGGER Древесные', price: 5700 },
  { id: 'eg-h3409', name: 'EGGER H3409 ST38 Лиственница горная белая', kind: 'sheet', color: '#dfd9d0', grain: true, category: 'EGGER Древесные', price: 5600 },

  // ——— 2. ЛДСП KronoSpan / Lamarty (Популярные древесные СНГ) ———
  { id: 'kr-k003', name: 'KronoSpan K003 PW Дуб Крафт золотой', kind: 'sheet', color: '#b8864e', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4800 },
  { id: 'kr-k001', name: 'KronoSpan K001 PW Дуб Крафт белый', kind: 'sheet', color: '#dcd5cb', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4800 },
  { id: 'kr-k002', name: 'KronoSpan K002 PW Дуб Крафт серый', kind: 'sheet', color: '#8f8982', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4800 },
  { id: 'kr-wotan', name: 'KronoSpan 5302 Дуб Вотан натуральный', kind: 'sheet', color: '#ad7f52', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4900 },
  { id: 'kr-sonoma-t', name: 'KronoSpan 3025 Дуб Сонома трюфель', kind: 'sheet', color: '#99826c', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4600 },
  { id: 'kr-wenge', name: 'KronoSpan 0854 Венге Магия тёмный', kind: 'sheet', color: '#3b2b23', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4600 },
  { id: 'kr-shimo-l', name: 'Lamarty Ясень Шимо светлый', kind: 'sheet', color: '#cfc0ad', grain: true, category: 'KronoSpan / Lamarty Древесные', price: 4700 },

  // ——— 2б. ЛДСП Томск (Томсклесдрев Lamarty / Томск 16 мм) ———
  { id: 'tomsk-white', name: 'ЛДСП Томск Белый матовый (выбор клиента)', kind: 'sheet', color: '#f7f7f5', supermat: true, category: 'ЛДСП Томск (Томсклесдрев)', price: 4300 },
  { id: 'tomsk-ivory', name: 'ЛДСП Томск Айвори / Слоновая кость матовый', kind: 'sheet', color: '#f2eadc', supermat: true, category: 'ЛДСП Томск (Томсклесдрев)', price: 4500 },
  { id: 'tomsk-grey', name: 'ЛДСП Томск Светло-серый матовый', kind: 'sheet', color: '#cecfcc', supermat: true, category: 'ЛДСП Томск (Томсклесдрев)', price: 4400 },
  { id: 'tomsk-sonoma', name: 'ЛДСП Томск Дуб Сонома светлый', kind: 'sheet', color: '#cbb089', grain: true, category: 'ЛДСП Томск (Томсклесдрев)', price: 4600 },

  // ——— 3. ЛДСП EGGER: Однотонные (ST9 Matt — Белые, Бежевые, Серые, Акцентные) ———
  { id: 'eg-w1000', name: 'EGGER W1000 ST9 Белый Премиум', kind: 'sheet', color: '#faf9f5', category: 'EGGER Однотонные', price: 4800 },
  { id: 'eg-w1100', name: 'EGGER W1100 ST9 Белый Альпийский', kind: 'sheet', color: '#ffffff', category: 'EGGER Однотонные', price: 4900 },
  { id: 'eg-w980', name: 'EGGER W980 ST2 Белый платиновый', kind: 'sheet', color: '#f4f3f0', category: 'EGGER Однотонные', price: 4400 },
  { id: 'eg-u702', name: 'EGGER U702 ST9 Кашемир серый', kind: 'sheet', color: '#c8beaf', category: 'EGGER Однотонные', price: 5200 },
  { id: 'eg-u156', name: 'EGGER U156 ST9 Бежевый песочный', kind: 'sheet', color: '#dfd3c3', category: 'EGGER Однотонные', price: 4900 },
  { id: 'eg-ral1015', name: 'EGGER U113 ST9 Слоновая кость (RAL 1015)', kind: 'sheet', color: '#e6d9bd', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u211', name: 'EGGER U211 ST9 Миндаль бежевый', kind: 'sheet', color: '#ccb5a1', category: 'EGGER Однотонные', price: 5200 },
  { id: 'eg-u750', name: 'EGGER U750 ST9 Серо-бежевый Тауп', kind: 'sheet', color: '#b4aca0', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u748', name: 'EGGER U748 ST9 Трюфель коричневый', kind: 'sheet', color: '#6e6259', category: 'EGGER Однотонные', price: 5200 },
  { id: 'eg-u708', name: 'EGGER U708 ST9 Светло-серый', kind: 'sheet', color: '#cccbc7', category: 'EGGER Однотонные', price: 4600 },
  { id: 'eg-u763', name: 'EGGER U763 ST9 Серый перламутровый', kind: 'sheet', color: '#a5a19c', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u727', name: 'EGGER U727 ST9 Серый глиняный', kind: 'sheet', color: '#9a9187', category: 'EGGER Однотонные', price: 5200 },
  { id: 'eg-u732', name: 'EGGER U732 ST9 Серый пыльный', kind: 'sheet', color: '#8c8984', category: 'EGGER Однотонные', price: 5100 },
  { id: 'eg-u961', name: 'EGGER U961 ST9 Графит серый', kind: 'sheet', color: '#52565b', category: 'EGGER Однотонные', price: 5300 },
  { id: 'eg-u963', name: 'EGGER U963 ST9 Диамант серый (Антрацит)', kind: 'sheet', color: '#3d4045', category: 'EGGER Однотонные', price: 5300 },
  { id: 'eg-u999', name: 'EGGER U999 ST9 Чёрный', kind: 'sheet', color: '#202124', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u638', name: 'EGGER U638 ST9 Шалфей зелёный', kind: 'sheet', color: '#8a998c', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u665', name: 'EGGER U665 ST9 Камыш зелёный', kind: 'sheet', color: '#6a786d', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u636', name: 'EGGER U636 ST9 Фьорд зелёный', kind: 'sheet', color: '#5e7a75', category: 'EGGER Однотонные', price: 5300 },
  { id: 'eg-u606', name: 'EGGER U606 ST9 Лесной зелёный', kind: 'sheet', color: '#3a4d41', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u540', name: 'EGGER U540 ST9 Деним голубой', kind: 'sheet', color: '#6d8294', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u599', name: 'EGGER U599 ST9 Индиго синий', kind: 'sheet', color: '#2d3d52', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u325', name: 'EGGER U325 ST9 Античный розовый (Пудра)', kind: 'sheet', color: '#c9a6a1', category: 'EGGER Однотонные', price: 5400 },
  { id: 'eg-u335', name: 'EGGER U335 ST9 Терракота рыжий', kind: 'sheet', color: '#a85d48', category: 'EGGER Однотонные', price: 5400 },

  // ——— 4. ЛДСП EGGER: Бетон, Камень и Металл ———
  { id: 'eg-f186', name: 'EGGER F186 ST9 Бетон Чикаго светло-серый', kind: 'sheet', color: '#bcbbb7', stone: true, category: 'EGGER Камень и бетон', price: 6400 },
  { id: 'eg-f187', name: 'EGGER F187 ST9 Бетон Чикаго тёмный', kind: 'sheet', color: '#585756', stone: true, category: 'EGGER Камень и бетон', price: 6400 },
  { id: 'eg-f206', name: 'EGGER F206 ST9 Камень Пьетра Гриджиа чёрный', kind: 'sheet', color: '#303135', stone: true, category: 'EGGER Камень и бетон', price: 6600 },
  { id: 'eg-f204', name: 'EGGER F204 ST9 Мрамор Каррара белый', kind: 'sheet', color: '#dfdad3', stone: true, category: 'EGGER Камень и бетон', price: 6600 },
  { id: 'eg-f812', name: 'EGGER F812 ST9 Мрамор Леванто белый', kind: 'sheet', color: '#eeebe5', stone: true, category: 'EGGER Камень и бетон', price: 6800 },
  { id: 'eg-f242', name: 'EGGER F242 ST10 Юрский сланец антрацит', kind: 'sheet', color: '#434346', stone: true, category: 'EGGER Камень и бетон', price: 6500 },
  { id: 'eg-f637', name: 'EGGER F637 ST16 Хромикс белый (штукатурка)', kind: 'sheet', color: '#dcd9d2', stone: true, category: 'EGGER Камень и бетон', price: 6400 },
  { id: 'eg-f302', name: 'EGGER F302 ST87 Ферро бронза (металл)', kind: 'sheet', color: '#6b5344', stone: true, category: 'EGGER Камень и бетон', price: 6700 },
  { id: 'eg-f501', name: 'EGGER F501 ST2 Титан брашированный', kind: 'sheet', color: '#92969c', stone: true, category: 'EGGER Камень и бетон', price: 6700 },

  // ——— 5. Фасады: EGGER PerfectSense Matt (PM — супермат anti-fingerprint) ———
  { id: 'pm-w1100', name: 'EGGER PM W1100 Белый Альпийский супермат', kind: 'facade', color: '#ffffff', supermat: true, category: 'EGGER PerfectSense Matt', price: 28000 },
  { id: 'pm-u702', name: 'EGGER PM U702 Кашемир супермат', kind: 'facade', color: '#c8beaf', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u211', name: 'EGGER PM U211 Миндаль бежевый супермат', kind: 'facade', color: '#ccb5a1', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u750', name: 'EGGER PM U750 Тауп серо-бежевый супермат', kind: 'facade', color: '#b4aca0', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u727', name: 'EGGER PM U727 Глиняный серый супермат', kind: 'facade', color: '#9a9187', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u732', name: 'EGGER PM U732 Серый пыльный супермат', kind: 'facade', color: '#8c8984', supermat: true, category: 'EGGER PerfectSense Matt', price: 29000 },
  { id: 'pm-u961', name: 'EGGER PM U961 Графит супермат', kind: 'facade', color: '#4c5055', supermat: true, category: 'EGGER PerfectSense Matt', price: 29500 },
  { id: 'pm-u999', name: 'EGGER PM U999 Чёрный глубокий супермат', kind: 'facade', color: '#1a1a1c', supermat: true, category: 'EGGER PerfectSense Matt', price: 31000 },
  { id: 'pm-u665', name: 'EGGER PM U665 Шалфей зелёный супермат', kind: 'facade', color: '#6e7d71', supermat: true, category: 'EGGER PerfectSense Matt', price: 30000 },
  { id: 'pm-u606', name: 'EGGER PM U606 Тёмный изумруд супермат', kind: 'facade', color: '#2b3e34', supermat: true, category: 'EGGER PerfectSense Matt', price: 30000 },
  { id: 'pm-u599', name: 'EGGER PM U599 Индиго синий супермат', kind: 'facade', color: '#2c3b4e', supermat: true, category: 'EGGER PerfectSense Matt', price: 30000 },

  // ——— 6. Фасады: AGT Supramat & High Gloss (Турция, МДФ 18 мм) ———
  { id: 'agt-3013', name: 'AGT Supramat 3013 Белый Бриллиант софт-тач', kind: 'facade', color: '#f8f8f6', supermat: true, category: 'AGT Панели', price: 25500 },
  { id: 'agt-3014', name: 'AGT Supramat 3014 Кремовый софт-тач', kind: 'facade', color: '#ede5d5', supermat: true, category: 'AGT Панели', price: 25500 },
  { id: 'agt-3019', name: 'AGT Supramat 3019 Сафари серый', kind: 'facade', color: '#b2a99d', supermat: true, category: 'AGT Панели', price: 26000 },
  { id: 'agt-3020', name: 'AGT Supramat 3020 Макадамия', kind: 'facade', color: '#8e7a68', supermat: true, category: 'AGT Панели', price: 26000 },
  { id: 'agt-3024', name: 'AGT Supramat 3024 Трюфель', kind: 'facade', color: '#5a4d46', supermat: true, category: 'AGT Панели', price: 26500 },
  { id: 'agt-3016', name: 'AGT Supramat 3016 Серый шторм', kind: 'facade', color: '#6f7378', supermat: true, category: 'AGT Панели', price: 26000 },
  { id: 'agt-3026', name: 'AGT Supramat 3026 Ниагара (тиффани/сине-зелёный)', kind: 'facade', color: '#4d6f73', supermat: true, category: 'AGT Панели', price: 26500 },
  { id: 'agt-3028', name: 'AGT Supramat 3028 Оливковый лес', kind: 'facade', color: '#5c6b57', supermat: true, category: 'AGT Панели', price: 26500 },
  { id: 'agt-601', name: 'AGT 601 Белый высокий глянец', kind: 'facade', color: '#fafafc', gloss: true, category: 'AGT Панели', price: 24000 },
  { id: 'agt-605', name: 'AGT 605 Капучино высокий глянец', kind: 'facade', color: '#cbb9a6', gloss: true, category: 'AGT Панели', price: 24500 },
  { id: 'agt-734', name: 'AGT 734 Антрацит высокий глянец', kind: 'facade', color: '#383b40', gloss: true, category: 'AGT Панели', price: 24500 },

  // ——— 6б. Фасады: МДФ Модерн в Плёнке ПВХ Софт-тач (Айвори Софт и др.) ———
  { id: 'pvc-ivory-soft', name: 'МДФ Плёнка ПВХ Айвори Софт (Ivory Soft-Touch)', kind: 'facade', color: '#f2ebdc', supermat: true, category: 'МДФ Плёнка ПВХ (Софт-тач)', price: 21500 },
  { id: 'pvc-white-soft', name: 'МДФ Плёнка ПВХ Белый Снег Софт', kind: 'facade', color: '#f9f9f7', supermat: true, category: 'МДФ Плёнка ПВХ (Софт-тач)', price: 21000 },
  { id: 'pvc-cashmere-soft', name: 'МДФ Плёнка ПВХ Кашемир Софт', kind: 'facade', color: '#cdc3b4', supermat: true, category: 'МДФ Плёнка ПВХ (Софт-тач)', price: 21500 },
  { id: 'pvc-latte-soft', name: 'МДФ Плёнка ПВХ Латте Софт', kind: 'facade', color: '#bcae9e', supermat: true, category: 'МДФ Плёнка ПВХ (Софт-тач)', price: 21500 },
  { id: 'pvc-graphite-soft', name: 'МДФ Плёнка ПВХ Графит Софт', kind: 'facade', color: '#46494f', supermat: true, category: 'МДФ Плёнка ПВХ (Софт-тач)', price: 22000 },

  // ——— 7. Фасады: МДФ Эмаль (Покраска по каталогу RAL / NCS) ———
  { id: 'm-white', name: 'МДФ Эмаль Белый сигнал (RAL 9003 мат)', kind: 'facade', color: '#fafaf7', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 24000 },
  { id: 'm-ral9010', name: 'МДФ Эмаль Сливочно-белый (RAL 9010 мат)', kind: 'facade', color: '#f5f2e9', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 24000 },
  { id: 'm-ral1013', name: 'МДФ Эмаль Жемчужно-белый (RAL 1013 мат)', kind: 'facade', color: '#eae3d2', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 24500 },
  { id: 'm-ral1015', name: 'МДФ Эмаль Нежный беж (RAL 1015 мат)', kind: 'facade', color: '#e6d9bd', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 25000 },
  { id: 'm-ral7044', name: 'МДФ Эмаль Серый шёлк (RAL 7044 мат)', kind: 'facade', color: '#bdbbb0', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 25000 },
  { id: 'm-grey', name: 'МДФ Эмаль Кварцевый серый (RAL 7035 мат)', kind: 'facade', color: '#9aa0a6', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 25000 },
  { id: 'm-ral7016', name: 'МДФ Эмаль Антрацит (RAL 7016 мат)', kind: 'facade', color: '#383e42', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 25500 },
  { id: 'm-ral8019', name: 'МДФ Эмаль Мокко коричневый (RAL 8019 мат)', kind: 'facade', color: '#4d413b', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 25500 },
  { id: 'm-ral6021', name: 'МДФ Эмаль Мятный шалфей (RAL 6021 мат)', kind: 'facade', color: '#869984', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },
  { id: 'm-emerald', name: 'МДФ Эмаль Изумрудный мох (RAL 6005 мат)', kind: 'facade', color: '#2f5d50', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },
  { id: 'm-ral5014', name: 'МДФ Эмаль Скандинавский синий (RAL 5014 мат)', kind: 'facade', color: '#637a91', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },
  { id: 'm-navy', name: 'МДФ Эмаль Сапфирово-синий (RAL 5003 мат)', kind: 'facade', color: '#2b3f66', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },
  { id: 'm-ral3012', name: 'МДФ Эмаль Пыльная роза (RAL 3012 мат)', kind: 'facade', color: '#c4968b', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },
  { id: 'm-terra', name: 'МДФ Эмаль Терракот (RAL 2001 мат)', kind: 'facade', color: '#b9694c', gloss: false, category: 'МДФ Эмаль (RAL / NCS)', price: 26000 },

  // ——— 8. Фасады: Витрины с подсветкой (Стекло в алюминиевом профиле Золото / Чёрный), Зеркала и Базовые ———
  { id: 'vitrine-bronze-gold', name: 'Витрина: Стекло Бронза в профиле Золото + LED подсветка', kind: 'facade', color: '#9c784c', gloss: true, category: 'Витрины Стекло и Зеркала', price: 38000 },
  { id: 'vitrine-graphite-black', name: 'Витрина: Стекло Графит в чёрном профиле + LED подсветка', kind: 'facade', color: '#4b525a', gloss: true, category: 'Витрины Стекло и Зеркала', price: 36000 },
  { id: 'm-mirror', name: 'Зеркало серебро 4 мм на подложке ЛДСП', kind: 'facade', color: '#d8e3ec', gloss: true, category: 'Витрины Стекло и Зеркала', price: 22000 },
  { id: 'm-mirror-gr', name: 'Зеркало Графит тонированное в тонком профиле', kind: 'facade', color: '#69727a', gloss: true, category: 'Витрины Стекло и Зеркала', price: 27000 },
  { id: 'm-mirror-br', name: 'Зеркало Бронза тёплое в рамке', kind: 'facade', color: '#9c8672', gloss: true, category: 'Витрины Стекло и Зеркала', price: 27000 },
  { id: 'm-glass-fl', name: 'Витрина Стекло рифлёное Flutes (Мору) в чёрной рамке', kind: 'facade', color: '#b8c7d4', gloss: true, category: 'Витрины Стекло и Зеркала', price: 32000 },
  { id: 'f-white', name: 'Фасад ЛДСП Белый гладкий', kind: 'facade', color: '#f4f3ef', category: 'Базовые фасады', price: 4200 },
  { id: 'f-sonoma', name: 'Фасад ЛДСП Дуб Сонома', kind: 'facade', color: '#cfae82', grain: true, category: 'Базовые фасады', price: 5200 },
  { id: 'f-walnut', name: 'Фасад ЛДСП Орех', kind: 'facade', color: '#6c4a35', grain: true, category: 'Базовые фасады', price: 5600 },
  { id: 'f-graphite', name: 'Фасад ЛДСП Графит', kind: 'facade', color: '#3c4046', category: 'Базовые фасады', price: 4800 },

  // ——— 9. Влагостойкие столешницы 38 мм и Компакт-плиты HPL (EGGER / Slotex) ———
  { id: 'top-f812', name: 'EGGER F812 ST76 Мрамор Леванто белый 38 мм', kind: 'top', color: '#edebe6', stone: true, category: 'Столешницы Камень и Мрамор', price: 42000 },
  { id: 'top-f204', name: 'EGGER F204 ST76 Мрамор Каррара белый 38 мм', kind: 'top', color: '#e3dfd7', stone: true, category: 'Столешницы Камень и Мрамор', price: 42000 },
  { id: 'top-f206', name: 'EGGER F206 ST9 Пьетра Гриджиа чёрный 38 мм', kind: 'top', color: '#2b2c30', stone: true, category: 'Столешницы Камень и Мрамор', price: 44000 },
  { id: 'top-f242', name: 'EGGER F242 ST10 Юрский сланец антрацит 38 мм', kind: 'top', color: '#3e3e41', stone: true, category: 'Столешницы Камень и Мрамор', price: 41000 },
  { id: 'top-f186', name: 'EGGER F186 ST9 Бетон Чикаго светлый 38 мм', kind: 'top', color: '#b8b7b3', stone: true, category: 'Столешницы Камень и Мрамор', price: 39000 },
  { id: 'top-f187', name: 'EGGER F187 ST9 Бетон Чикаго тёмный 38 мм', kind: 'top', color: '#525150', stone: true, category: 'Столешницы Камень и Мрамор', price: 39000 },
  { id: 'top-trav', name: 'Slotex 2264 Травертин Римский бежевый 38 мм', kind: 'top', color: '#d4c8b4', stone: true, category: 'Столешницы Камень и Мрамор', price: 38000 },
  { id: 'top-terrazzo', name: 'Slotex 3180 Терраццо Венеция светлый 38 мм', kind: 'top', color: '#dad5cc', stone: true, category: 'Столешницы Камень и Мрамор', price: 41000 },
  { id: 'top-quartz-w', name: 'Компакт-плита HPL Белый Кварц с чёрным ядром', kind: 'top', color: '#f4f3ef', stone: true, category: 'Столешницы Камень и Мрамор', price: 54000 },
  { id: 'top-white-matt', name: 'Столешница Белая матовая широкая 38 мм (до 4.2 м без стыка)', kind: 'top', color: '#f8f8f6', supermat: true, category: 'Столешницы Камень и Мрамор', price: 39500 },
  { id: 'top-w1000', name: 'EGGER W1000 ST76 Белый Премиум влагостойкий 38 мм', kind: 'top', color: '#f5f4ef', category: 'Столешницы Камень и Мрамор', price: 36000 },
  { id: 't-stone', name: 'Столешница Камень светлый базовый 38 мм', kind: 'top', color: '#d8d5ce', stone: true, category: 'Столешницы Камень и Мрамор', price: 38000 },
  { id: 't-dark', name: 'Столешница Камень тёмный базовый 38 мм', kind: 'top', color: '#2b2b2e', stone: true, category: 'Столешницы Камень и Мрамор', price: 40000 },
  { id: 'top-h1180', name: 'EGGER H1180 ST37 Дуб Галифакс натуральный 38 мм', kind: 'top', color: '#b58a5c', grain: true, category: 'Столешницы Древесные', price: 46000 },
  { id: 'top-h1181', name: 'EGGER H1181 ST37 Дуб Галифакс табак 38 мм', kind: 'top', color: '#6b4f3b', grain: true, category: 'Столешницы Древесные', price: 46000 },
  { id: 'top-h3303', name: 'EGGER H3303 ST10 Дуб Гамильтон 38 мм', kind: 'top', color: '#bfa280', grain: true, category: 'Столешницы Древесные', price: 41000 },
  { id: 'top-h3398', name: 'EGGER H3398 ST12 Дуб Кендал коньяк 38 мм', kind: 'top', color: '#a87d54', grain: true, category: 'Столешницы Древесные', price: 41000 },
  { id: 'top-h1344', name: 'EGGER H1344 ST32 Дуб Шерман коньяк 38 мм', kind: 'top', color: '#845d42', grain: true, category: 'Столешницы Древесные', price: 42000 },
  { id: 'top-h3734', name: 'EGGER H3734 ST9 Орех Дижон натуральный 38 мм', kind: 'top', color: '#654a3a', grain: true, category: 'Столешницы Древесные', price: 42000 },
  { id: 't-oak', name: 'Столешница Дуб натуральный базовый 38 мм', kind: 'top', color: '#b8905f', grain: true, category: 'Столешницы Древесные', price: 36000 },

  // ——— 10. Задняя стенка (ХДФ / ДВП ламинированный 4 мм) ———
  { id: 'b-white', name: 'ХДФ Белый 4 мм', kind: 'back', color: '#f0efe9', category: 'Задняя стенка (ХДФ)', price: 1400 },
  { id: 'b-cashmere', name: 'ХДФ Кашемир / Бежевый 4 мм', kind: 'back', color: '#cbc0b1', category: 'Задняя стенка (ХДФ)', price: 1500 },
  { id: 'b-grey', name: 'ХДФ Светло-серый 4 мм', kind: 'back', color: '#c8c8c5', category: 'Задняя стенка (ХДФ)', price: 1400 },
  { id: 'b-graphite', name: 'ХДФ Графит 4 мм', kind: 'back', color: '#42454a', category: 'Задняя стенка (ХДФ)', price: 1600 },
  { id: 'b-black', name: 'ХДФ Чёрный 4 мм', kind: 'back', color: '#222225', category: 'Задняя стенка (ХДФ)', price: 1600 },
  { id: 'b-oak', name: 'ХДФ Дуб Галифакс / Сонома 4 мм', kind: 'back', color: '#bf9e76', grain: true, category: 'Задняя стенка (ХДФ)', price: 1800 },
  { id: 'b-walnut', name: 'ХДФ Орех тёмный / Табак 4 мм', kind: 'back', color: '#6b4f3b', grain: true, category: 'Задняя стенка (ХДФ)', price: 1800 },

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
  mech400: { name: 'Встроенный выдвижной механизм на 400 мм (с доводчиком)', unit: 'компл', price: 38000 },
  ledVitrine: { name: 'LED-подсветка витрины тёплая (профиль + блок питания)', unit: 'компл', price: 14500 },
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
  w: [50, 4200],
  h: [150, 3200],
  d: [150, 800],
  plinth: [0, 200],
  topTrim: [0, 250],
  lift: [0, 3000],
  sections: [1, 5],
  shelves: [0, 12],
  drawers: [0, 6],
  rods: [0, 2],
  drawerH: [100, 650],
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
  { id: 'corners', label: 'Угловые модули (для Г и П-кухонь)', ids: ['corner-blind', 'corner-sink-blind', 'corner', 'corner-diag', 'cornerWall-blind', 'cornerWall', 'cornerWall-diag', 'filler-corner'] },
  { id: 'kitchen', label: 'Кухня (прямые модули, витрины и пеналы)', ids: ['base', 'base-drawers', 'mech-400', 'sink', 'oven', 'cargo', 'wall', 'wall-vitrine-bronze', 'dish-dryer', 'mezzanine', 'tall', 'tall-vitrine-bronze', 'tall-oven', 'fridge', 'filler', 'filler-wall'] },
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
    hint: '600 × 360 × 560, подъём вверх (газлифт)',
    make: () => base('wall', 'Антресоль', { w: 600, h: 360, d: 560, lift: 2170, hinge: 'top', milling: 'ribbed', handles: false, sections: [sec({ shelves: 0 })] }),
  },
  {
    id: 'corner-blind',
    label: 'Угловой нижний прямой (с L-планкой)',
    hint: '1050 × 820 × 560, глухая зона + L-бленда 90°',
    make: () =>
      base('base', 'Угловой нижний (прямой)', {
        w: 1050, h: 820, d: 560, plinth: 100, countertop: true,
        blindSide: 'left', blindW: 605, blindFillerW: 45, doorCount: 1, hinge: 'left',
        sections: [sec({ shelves: 1 })],
      }),
  },
  {
    id: 'corner-sink-blind',
    label: 'Угловой под мойку прямой',
    hint: '1100 × 820 × 560, мойка + L-бленда 90°',
    make: () =>
      base('base', 'Модуль под мойку (угловой)', {
        w: 1100, h: 820, d: 560, plinth: 100, countertop: true,
        blindSide: 'left', blindW: 605, blindFillerW: 45, doorCount: 1, hinge: 'right',
        sections: [sec({ shelves: 0 })],
      }),
  },
  {
    id: 'corner',
    label: 'Угловой нижний Г-образный 90°',
    hint: '900 × 900, фасад-гармошка 2 створки',
    make: () =>
      base('corner', 'Угловой нижний 90°', {
        w: 900, cornerW2: 900, cornerMode: 'l-shape', h: 820, d: 560, plinth: 100, countertop: true,
        sections: [sec({ shelves: 1 })],
      }),
  },
  {
    id: 'corner-diag',
    label: 'Угловой нижний Трапеция 45°',
    hint: '900 × 900, скошенная дверь 45° + мойка',
    make: () =>
      base('corner', 'Угловой трапеция 45°', {
        w: 900, cornerW2: 900, cornerMode: 'diagonal', cornerSink: true, h: 820, d: 560, plinth: 100, countertop: true,
        sections: [sec({ shelves: 1 })],
      }),
  },
  {
    id: 'cornerWall-blind',
    label: 'Угловой верхний прямой (с L-планкой)',
    hint: '950 × 720 × 300, глухая зона + L-бленда 90°',
    make: () =>
      base('wall', 'Угловой верхний (прямой)', {
        w: 950, h: 720, d: 300, lift: 1450,
        blindSide: 'left', blindW: 340, blindFillerW: 40, doorCount: 1, hinge: 'left',
        sections: [sec({ shelves: 2 })],
      }),
  },
  {
    id: 'cornerWall',
    label: 'Угловой верхний Г-образный 90°',
    hint: '600 × 600 × 300, навесной Г-модуль',
    make: () =>
      base('cornerWall', 'Угловой верхний 90°', {
        w: 600, cornerW2: 600, cornerMode: 'l-shape', h: 720, d: 300, lift: 1450,
        sections: [sec({ shelves: 2 })],
      }),
  },
  {
    id: 'cornerWall-diag',
    label: 'Угловой верхний Трапеция 45°',
    hint: '600 × 600 × 300, скошенная дверь 45°',
    make: () =>
      base('cornerWall', 'Угловой верхний 45°', {
        w: 600, cornerW2: 600, cornerMode: 'diagonal', h: 720, d: 300, lift: 1450,
        sections: [sec({ shelves: 2 })],
      }),
  },
  {
    id: 'tall',
    label: 'Пенал хранения',
    hint: '600 × 2200, 4 полки',
    make: () => base('tall', 'Пенал', { w: 600, h: 2200, d: 560, plinth: 100, sections: [sec({ shelves: 4 })] }),
  },
  {
    id: 'tall-oven',
    label: 'Пенал под духовку и СВЧ',
    hint: '600 × 2200, ящик + ниши 600/380 + полки',
    make: () =>
      base('tall', 'Пенал под духовку и СВЧ', {
        w: 600, h: 2200, d: 560, plinth: 100, drawerH: 360, ovenH: 600, mwH: 380,
        sections: [sec({ drawers: 1, shelves: 2 })],
      }),
  },
  {
    id: 'fridge',
    label: 'Холодильник (невстроенный)',
    hint: '600 × 2000 × 650, габарит без ЛДСП',
    make: () => base('tall', 'Холодильник (невстроенный)', { w: 600, h: 2000, d: 650, plinth: 0, doorMode: 'none', handles: true, sections: [sec({ shelves: 0, door: false })] }),
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
    label: 'Бутылочница (карго 200)',
    hint: '200 × 820, выкатная корзина',
    make: () =>
      base('base', 'Бутылочница (карго)', {
        w: 200, h: 820, d: 560, plinth: 100, countertop: true, doorMode: 'none',
        sections: [sec({ drawers: 1, door: false })],
      }),
  },
  {
    id: 'mech-400',
    label: 'Встроенный механизм 400 мм',
    hint: '400 × 820, выкатная система хранения с доводчиком',
    make: () =>
      base('base', 'Модуль со встр. механизмом 400', {
        w: 400, h: 820, d: 500, plinth: 100, countertop: true, doorMode: 'none', drawerH: 716, handlePos: 'top-horiz',
        sections: [sec({ drawers: 1, door: false })],
      }),
  },
  {
    id: 'wall-vitrine-bronze',
    label: 'Витрина навесная Бронза / Золото + LED',
    hint: '600 × 800 × 300, стекло бронза в золотом профиле',
    make: () =>
      base('wall', 'Витрина Бронза в профиле Золото', {
        w: 600, h: 800, d: 300, lift: 1450, matFacade: 'vitrine-bronze-gold', handleColor: 'gold',
        sections: [sec({ shelves: 2 })],
      }),
  },
  {
    id: 'tall-vitrine-bronze',
    label: 'Пенал-витрина Бронза / Золото + LED',
    hint: '600 × 2400 × 500, стеклянные полки с подсветкой',
    make: () =>
      base('tall', 'Пенал-витрина Бронза в профиле Золото', {
        w: 600, h: 2400, d: 500, plinth: 100, matFacade: 'vitrine-bronze-gold', handleColor: 'gold',
        sections: [sec({ shelves: 5 })],
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
