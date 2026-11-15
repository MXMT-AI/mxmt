import type { Chip, InsightItem, StockItem, Week } from "./calendar-types";

const DEMO_DATA: Record<string, Record<string, Chip[]>> = {
  accent: {
    w14: [{ t: "promo", l: "Outlet" }],
    w15: [{ t: "promo", l: "Підбірка мануфактурних калібрів" }],
    w16: [{ t: "promo", l: "Новинки Breda — підбірка з деталями" }],
    w17: [{ t: "promo", l: "Новинки LIP — підбірка з деталями" }],
    w18: [{ t: "promo", l: "Новинки D1 Milano — підбірка з деталями" }],
    w19: [{ t: "event", l: "Ukrainian Design Week" }],
    w20: [{ t: "promo", l: "Watches підбірка" }],
    w21: [{ t: "promo", l: "Літня колекція окулярів push" }],
  },
  accent2: {
    w15: [{ t: "event", l: "Окуляри KOMONO та CHPO SS26" }],
    w16: [{ t: "event", l: "Окуляри KOMONO та CHPO SS26" }],
    w17: [{ t: "event", l: "Окуляри KOMONO та CHPO SS26" }],
    w18: [{ t: "event", l: "Окуляри KOMONO та CHPO SS26" }],
    w19: [{ t: "event", l: "Окуляри KOMONO та CHPO літо" }],
    w20: [{ t: "event", l: "Окуляри KOMONO та CHPO літо" }],
  },
  accent3: {
    w15: [{ t: "event", l: "Подарунки до Великодня — свічки + inspired.by" }],
    w16: [{ t: "promo", l: "Неокласичні бренди (Watches & Wonders)" }],
    w17: [{ t: "promo", l: "Бертучі — польові годинники" }],
    w18: [{ t: "promo", l: "Лайфстайл. Книжки + ігри + пледи" }],
  },
  focus: {
    w15: [{ t: "promo", l: "Breda, LIP, D1. Окуляри KOMONO, CHPO" }],
    w16: [{ t: "promo", l: "Breda, LIP. KOMONO, CHPO. Лайфстайл" }],
    w17: [{ t: "promo", l: "Breda, LIP, D1, Бертучі. Окуляри" }],
    w18: [{ t: "promo", l: "Breda, LIP, D1. KOMONO, CHPO. Printworks" }],
  },
  promo: {
    w15: [{ t: "sale", l: "Outlet" }], w16: [{ t: "sale", l: "Outlet" }],
    w17: [{ t: "sale", l: "Outlet" }], w18: [{ t: "sale", l: "Outlet" }],
  },
  events: {
    w15: [{ t: "holiday", l: "12.04 Великдень. ZAVOD не працює" }],
    w16: [{ t: "event",   l: "14–20.04 Watches and Wonders Geneva" }],
    w17: [{ t: "holiday", l: "26.04 Чорнобильська трагедія" }],
    w18: [{ t: "holiday", l: "1 травня — День праці" }],
    w19: [{ t: "event",   l: "4–10.05 Ukrainian Design Week" }],
    w21: [{ t: "holiday", l: "Вишиванка day" }],
    w26: [{ t: "holiday", l: "28.06 День Конституції" }],
  },
  ban1: {
    w15: [{ t: "promo", l: "Новинки Breda (з 10.04)" }], w16: [{ t: "promo", l: "Новинки Breda" }],
    w17: [{ t: "promo", l: "Новинки D1 Milano" }],       w18: [{ t: "promo", l: "Новинки D1 Milano" }],
  },
  ban2: {
    w15: [{ t: "promo", l: "Новинки Lip" }],   w16: [{ t: "promo", l: "Новинки Lip" }],
    w17: [{ t: "promo", l: "Новинки Breda" }], w18: [{ t: "promo", l: "Новинки Breda" }],
  },
  ban3: {
    w15: [{ t: "event", l: "Лайфстайл до Великодня: свічки" }],
    w16: [{ t: "event", l: "Окуляри KOMONO" }],
    w17: [{ t: "promo", l: "Новинки Lip" }], w18: [{ t: "promo", l: "Новинки Lip" }],
  },
  comm: { w15: [{ t: "promo", l: "Email: Новинки Breda, Lip, D1" }], w17: [{ t: "promo", l: "Email: Новинки D1 Milano" }] },
  ads1: { w15: [{ t: "promo", l: "Окуляри KOMONO каталог" }], w16: [{ t: "promo", l: "Окуляри KOMONO каталог" }], w17: [{ t: "promo", l: "Окуляри KOMONO каталог" }], w18: [{ t: "promo", l: "Окуляри KOMONO каталог" }] },
  ads2: { w15: [{ t: "promo", l: "Окуляри CHPO каталог" }], w16: [{ t: "promo", l: "Окуляри CHPO каталог" }], w17: [{ t: "promo", l: "Окуляри CHPO каталог" }], w18: [{ t: "promo", l: "Окуляри CHPO каталог" }] },
  ads3: { w15: [{ t: "promo", l: "Годинники Breda новинки" }], w16: [{ t: "promo", l: "Годинники Breda новинки" }], w17: [{ t: "promo", l: "Окуляри KOMONO загальне" }], w18: [{ t: "promo", l: "Окуляри KOMONO загальне" }] },
  ads4: { w15: [{ t: "promo", l: "Окуляри KOMONO загальне" }], w16: [{ t: "promo", l: "Окуляри KOMONO загальне" }], w17: [{ t: "promo", l: "Каталог годинників, LIP" }], w18: [{ t: "promo", l: "Каталог годинників, LIP, D1" }] },
  smm1: { w15: [{ t: "promo", l: "Великдень + свічки + inspired.by" }], w16: [{ t: "event", l: "Watches and Wonders Geneva" }], w17: [{ t: "promo", l: "Бертучі, D1, Breda" }], w18: [{ t: "promo", l: "Лайфстайл + книжки" }] },
  shoot: { w16: [{ t: "event", l: "Зйомка Breda launch" }], w19: [{ t: "event", l: "Зйомка літня кампанія KOMONO+CHPO" }] },
  supply: { w15: [{ t: "event", l: "Постачання Breda нові моделі" }], w17: [{ t: "event", l: "Постачання D1 Milano" }], w19: [{ t: "event", l: "Постачання CHPO літня колекція" }] },
};

const AGENT_INSIGHTS: Record<string, Chip[]> = {
  "w15_accent":  [{ t: "warn",  l: "! Великдень 12.04 — зупини Ads" }],
  "w15_supply":  [{ t: "agent", l: "+ Breda прийшов → launch campaign" }],
  "w16_ads1":    [{ t: "agent", l: "+ KOMONO WOH 29д → збільш бюджет 200%" }],
  "w16_accent":  [{ t: "warn",  l: "! CHPO WOH 13д — обережно з push" }],
  "w17_accent":  [{ t: "agent", l: "+ LIP WOH 28д — push новинки" }],
  "w17_supply":  [{ t: "stock", l: "⬆ D1 Milano → оновити банери" }],
  "w18_promo":   [{ t: "warn",  l: "! ZAVOD WOH 119д — Outlet недостатньо" }],
  "w18_accent3": [{ t: "agent", l: "+ Printworks WOH 42д — push книжки+ігри" }],
  "w19_smm1":    [{ t: "agent", l: "+ Design Week → Instagram collab" }],
  "w19_supply":  [{ t: "stock", l: "⬆ CHPO літня колекція → готуй контент" }],
  "w20_ads2":    [{ t: "agent", l: "+ Літо → окуляри бюджет x3" }],
  "w21_accent":  [{ t: "agent", l: "+ Температура 25°C → максимум окулярів" }],
};

const DEMO_OLD_KEYS = ["w14","w15","w16","w17","w18","w19","w20","w21","w22","w23","w24","w25","w26"];
export const demoStock: StockItem[] = [
  { brand: "CHPO",       woh: 13,  stock: 649,  status: "warn" },
  { brand: "KOMONO",     woh: 29,  stock: 571,  status: "ok" },
  { brand: "BREDA",      woh: 23,  stock: 150,  status: "ok" },
  { brand: "PRINTWORKS", woh: 42,  stock: 198,  status: "ok" },
  { brand: "INSPIRED BY",woh: 8,   stock: 23,   status: "crit" },
  { brand: "ZAVOD",      woh: 119, stock: 1088, status: "excess" },
  { brand: "D1 MILANO",  woh: 40,  stock: 34,   status: "ok" },
  { brand: "LIP",        woh: 28,  stock: 48,   status: "ok" },
  { brand: "SEIKO",      woh: 14,  stock: 10,   status: "warn" },
];

export const demoInsights: InsightItem[] = [
  { type: "warn",  brand: "Великдень 12.04",   week: "Тижд 15",    title: "Зупини рекламу на 2 дні",                   desc: "ZAVOD не працює у свято. Зупини Ads щоб не зжигати бюджет на закритий магазин.", impact: "Економія: ₴2–3K бюджету на рекламу" },
  { type: "agent", brand: "BREDA",             week: "Тижд 15–16", title: "Постачання нових моделей — ідеально для launch", desc: "Нові моделі Breda прийшли. WOH 23 дні — нормальний оборот. Запусти launch campaign.", impact: "Прогноз: +₴40K виручки при бюджеті ₴2K" },
  { type: "warn",  brand: "CHPO",              week: "Тижд 15–18", title: "WOH 13 днів — сток критично низький",        desc: "Ви пушите CHPO у Ads кожного тижня, але WOH лише 13 днів. Ризик стокауту до W19.", impact: "Ризик: втрата ₴150K виручки через відсутність товару" },
  { type: "agent", brand: "KOMONO окуляри",    week: "Тижд 16–21", title: "Температура зростає — push окуляри x3",     desc: "Прогноз погоди: 18–25°C у квітні–травні. KOMONO WOH 29 днів — є запас.", impact: "Рекомендація: збільшити Ads бюджет на окуляри у 3 рази → +₴80K" },
  { type: "warn",  brand: "ZAVOD (власний)",   week: "Тижд 15–26", title: "WOH 119 днів — Outlet недостатньо",         desc: "1088 шт заморожено на ₴3M. Потрібна агресивна кампанія або flash-sale.", impact: "Flash-sale -30% у Тижд 18 → прогноз: звільнення ₴500K капіталу" },
  { type: "stock", brand: "D1 MILANO",         week: "Тижд 17",    title: "Постачання нових моделей — оновіть банери",  desc: "Нові D1 Milano прибувають. WOH 40 днів. Фокус на іміджевий контент.", impact: "Instagram Reels огляд + банер на сайті з 1 дня постачання" },
  { type: "agent", brand: "CHPO літо",         week: "Тижд 19",    title: "Нова літня колекція — готуйте контент заздалегідь", desc: "Постачання CHPO літньої колекції у Тижд 19. Зйомка повинна бути у Тижд 17–18.", impact: "Вчасна підготовка = +30% ефективності launch" },
];

function remapWeekKeys<T>(
  data: Record<string, Record<string, T>>,
  keyMap: Record<string, string>
): Record<string, Record<string, T>> {
  const result: Record<string, Record<string, T>> = {};
  for (const [row, weekData] of Object.entries(data)) {
    result[row] = {};
    for (const [k, v] of Object.entries(weekData)) {
      const mapped = keyMap[k];
      if (mapped) result[row][mapped] = v;
    }
  }
  return result;
}

function remapAgentInsightKeys(
  data: Record<string, Chip[]>,
  keyMap: Record<string, string>
): Record<string, Chip[]> {
  const result: Record<string, Chip[]> = {};
  for (const [key, chips] of Object.entries(data)) {
    const sep = key.indexOf("_");
    if (sep === -1) continue;
    const oldW = key.slice(0, sep);
    const row = key.slice(sep + 1);
    const newW = keyMap[oldW];
    if (newW) result[`${newW}_${row}`] = chips;
  }
  return result;
}

export function mapCalendarDemoData(weeks: Week[]) {
  const keyMap = Object.fromEntries(DEMO_OLD_KEYS.map((key, index) => [key, weeks[index]?.k]));
  return {
    demoEvents: remapWeekKeys(DEMO_DATA, keyMap),
    demoAgentInsights: remapAgentInsightKeys(AGENT_INSIGHTS, keyMap),
  };
}
