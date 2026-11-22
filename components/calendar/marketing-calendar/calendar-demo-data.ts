import type { Chip, InsightItem, StockItem, Week } from "./calendar-types";
import { calendarMarketingCalendarCalendarDemoDataMessages as englishCopy } from "@/messages/en.json";
import { calendarMarketingCalendarCalendarDemoDataMessages as ukrainianCopy } from "@/messages/uk.json";

const DEMO_DATA: Record<string, Record<string, Chip[]>> = {
  accent: {
    w14: [{ t: "promo", l: "Outlet" }],
    w15: [{ t: "promo", l: ukrainianCopy.lПідбіркаМануфактурнихКалібрів }],
    w16: [{ t: "promo", l: ukrainianCopy.lНовинкиBredaПідбіркаЗ }],
    w17: [{ t: "promo", l: ukrainianCopy.lНовинкиLIPПідбіркаЗ }],
    w18: [{ t: "promo", l: ukrainianCopy.lНовинкиD1MilanoПідбірка }],
    w19: [{ t: "event", l: englishCopy.lUkrainianDesignWeek }],
    w20: [{ t: "promo", l: ukrainianCopy.lWatchesПідбірка }],
    w21: [{ t: "promo", l: ukrainianCopy.lЛітняКолекціяОкулярівPush }],
  },
  accent2: {
    w15: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOSS26 }],
    w16: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOSS26 }],
    w17: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOSS26 }],
    w18: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOSS26 }],
    w19: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOЛіто }],
    w20: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONOТаCHPOЛіто }],
  },
  accent3: {
    w15: [{ t: "event", l: ukrainianCopy.lПодарункиДоВеликодняСвічки }],
    w16: [{ t: "promo", l: ukrainianCopy.lНеокласичніБрендиWatchesWonders }],
    w17: [{ t: "promo", l: ukrainianCopy.lБертучіПольовіГодинники }],
    w18: [{ t: "promo", l: ukrainianCopy.lЛайфстайлКнижкиІгри }],
  },
  focus: {
    w15: [{ t: "promo", l: ukrainianCopy.lBredaLIPD1ОкуляриKOMONO }],
    w16: [{ t: "promo", l: ukrainianCopy.lBredaLIPKOMONOCHPOЛайфстайл }],
    w17: [{ t: "promo", l: ukrainianCopy.lBredaLIPD1БертучіОкуляри }],
    w18: [{ t: "promo", l: englishCopy.lBredaLIPD1KOMONOCHPO }],
  },
  promo: {
    w15: [{ t: "sale", l: "Outlet" }], w16: [{ t: "sale", l: "Outlet" }],
    w17: [{ t: "sale", l: "Outlet" }], w18: [{ t: "sale", l: "Outlet" }],
  },
  events: {
    w15: [{ t: "holiday", l: ukrainianCopy.l1204ВеликденьZAVODНеПрацює }],
    w16: [{ t: "event",   l: englishCopy.l142004WatchesAndWondersGeneva }],
    w17: [{ t: "holiday", l: ukrainianCopy.l2604ЧорнобильськаТрагедія }],
    w18: [{ t: "holiday", l: ukrainianCopy.l1ТравняДеньПраці }],
    w19: [{ t: "event",   l: englishCopy.l41005UkrainianDesignWeek }],
    w21: [{ t: "holiday", l: ukrainianCopy.lВишиванкаDay }],
    w26: [{ t: "holiday", l: ukrainianCopy.l2806ДеньКонституції }],
  },
  ban1: {
    w15: [{ t: "promo", l: ukrainianCopy.lНовинкиBredaЗ1004 }], w16: [{ t: "promo", l: ukrainianCopy.lНовинкиBreda }],
    w17: [{ t: "promo", l: ukrainianCopy.lНовинкиD1Milano }],       w18: [{ t: "promo", l: ukrainianCopy.lНовинкиD1Milano }],
  },
  ban2: {
    w15: [{ t: "promo", l: ukrainianCopy.lНовинкиLip }],   w16: [{ t: "promo", l: ukrainianCopy.lНовинкиLip }],
    w17: [{ t: "promo", l: ukrainianCopy.lНовинкиBreda }], w18: [{ t: "promo", l: ukrainianCopy.lНовинкиBreda }],
  },
  ban3: {
    w15: [{ t: "event", l: ukrainianCopy.lЛайфстайлДоВеликодняСвічки }],
    w16: [{ t: "event", l: ukrainianCopy.lОкуляриKOMONO }],
    w17: [{ t: "promo", l: ukrainianCopy.lНовинкиLip }], w18: [{ t: "promo", l: ukrainianCopy.lНовинкиLip }],
  },
  comm: { w15: [{ t: "promo", l: ukrainianCopy.lEmailНовинкиBredaLipD1 }], w17: [{ t: "promo", l: ukrainianCopy.lEmailНовинкиD1Milano }] },
  ads1: { w15: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOКаталог }], w16: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOКаталог }], w17: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOКаталог }], w18: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOКаталог }] },
  ads2: { w15: [{ t: "promo", l: ukrainianCopy.lОкуляриCHPOКаталог }], w16: [{ t: "promo", l: ukrainianCopy.lОкуляриCHPOКаталог }], w17: [{ t: "promo", l: ukrainianCopy.lОкуляриCHPOКаталог }], w18: [{ t: "promo", l: ukrainianCopy.lОкуляриCHPOКаталог }] },
  ads3: { w15: [{ t: "promo", l: ukrainianCopy.lГодинникиBredaНовинки }], w16: [{ t: "promo", l: ukrainianCopy.lГодинникиBredaНовинки }], w17: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOЗагальне }], w18: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOЗагальне }] },
  ads4: { w15: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOЗагальне }], w16: [{ t: "promo", l: ukrainianCopy.lОкуляриKOMONOЗагальне }], w17: [{ t: "promo", l: ukrainianCopy.lКаталогГодинниківLIP }], w18: [{ t: "promo", l: ukrainianCopy.lКаталогГодинниківLIPD1 }] },
  smm1: { w15: [{ t: "promo", l: ukrainianCopy.lВеликденьСвічкиInspiredBy }], w16: [{ t: "event", l: englishCopy.lWatchesAndWondersGeneva }], w17: [{ t: "promo", l: ukrainianCopy.lБертучіD1Breda }], w18: [{ t: "promo", l: ukrainianCopy.lЛайфстайлКнижки }] },
  shoot: { w16: [{ t: "event", l: ukrainianCopy.lЗйомкаBredaLaunch }], w19: [{ t: "event", l: ukrainianCopy.lЗйомкаЛітняКампаніяKOMONOCHPO }] },
  supply: { w15: [{ t: "event", l: ukrainianCopy.lПостачанняBredaНовіМоделі }], w17: [{ t: "event", l: ukrainianCopy.lПостачанняD1Milano }], w19: [{ t: "event", l: ukrainianCopy.lПостачанняCHPOЛітняКолекція }] },
};

const AGENT_INSIGHTS: Record<string, Chip[]> = {
  "w15_accent":  [{ t: "warn",  l: ukrainianCopy.lВеликдень1204Зупини }],
  "w15_supply":  [{ t: "agent", l: ukrainianCopy.lBredaПрийшовLaunch }],
  "w16_ads1":    [{ t: "agent", l: ukrainianCopy.lKOMONOWOH29д }],
  "w16_accent":  [{ t: "warn",  l: ukrainianCopy.lCHPOWOH13д }],
  "w17_accent":  [{ t: "agent", l: ukrainianCopy.l }],
  "w17_supply":  [{ t: "stock", l: ukrainianCopy.lD1MilanoОновити }],
  "w18_promo":   [{ t: "warn",  l: ukrainianCopy.lZAVODWOH119д }],
  "w18_accent3": [{ t: "agent", l: ukrainianCopy.lPrintworksWOH42д }],
  "w19_smm1":    [{ t: "agent", l: "+ Design Week → Instagram collab" }],
  "w19_supply":  [{ t: "stock", l: ukrainianCopy.lCHPOЛітняКолекція }],
  "w20_ads2":    [{ t: "agent", l: ukrainianCopy.lЛітоОкуляриБюджет }],
  "w21_accent":  [{ t: "agent", l: ukrainianCopy.lТемпература25CМаксимум }],
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
  { type: "warn",  brand: ukrainianCopy.brandВеликдень1204,   week: ukrainianCopy.weekТижд15,    title: ukrainianCopy.titleЗупиниРекламуНа2Дні,                   desc: ukrainianCopy.descZAVODНеПрацюєУСвято, impact: ukrainianCopy.impactЕкономія23KБюджетуНаРекламу },
  { type: "agent", brand: "BREDA",             week: ukrainianCopy.weekТижд1516, title: ukrainianCopy.titleПостачанняНовихМоделейІдеально, desc: ukrainianCopy.descНовіМоделіBredaПрийшлиWOH, impact: ukrainianCopy.impactПрогноз40KВиручкиПриБюджеті },
  { type: "warn",  brand: "CHPO",              week: ukrainianCopy.weekТижд1518, title: ukrainianCopy.titleWOH13ДнівСток,        desc: ukrainianCopy.descВиПушитеCHPOУAds, impact: ukrainianCopy.impactРизикВтрата150KВиручкиЧерез },
  { type: "agent", brand: ukrainianCopy.brandKOMONOОкуляри,    week: ukrainianCopy.weekТижд1621, title: ukrainianCopy.titleТемператураЗростаєPushОкуляри,     desc: ukrainianCopy.descПрогнозПогоди1825CУКвітніТравні, impact: ukrainianCopy.impactРекомендаціяЗбільшитиAdsБюджетНа },
  { type: "warn",  brand: ukrainianCopy.brandZAVODВласний,   week: ukrainianCopy.weekТижд1526, title: ukrainianCopy.titleWOH119ДнівOutlet,         desc: ukrainianCopy.desc1088ШтЗамороженоНа3M, impact: ukrainianCopy.impactFlashSale30УТижд18 },
  { type: "stock", brand: "D1 MILANO",         week: ukrainianCopy.weekТижд17,    title: ukrainianCopy.titleПостачанняНовихМоделейОновіть,  desc: ukrainianCopy.descНовіD1MilanoПрибуваютьWOH, impact: ukrainianCopy.impactInstagramReelsОглядБанер },
  { type: "agent", brand: ukrainianCopy.brandCHPOЛіто,         week: ukrainianCopy.weekТижд19,    title: ukrainianCopy.titleНоваЛітняКолекціяГотуйте, desc: ukrainianCopy.descПостачанняCHPOЛітньоїКолекціїУ, impact: ukrainianCopy.impactВчаснаПідготовка30Ефективності },
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
  const demoEvents = remapWeekKeys(DEMO_DATA, keyMap);
  let demoEventCount = 0;
  for (const row of Object.values(demoEvents)) {
    for (const chips of Object.values(row)) demoEventCount += chips.length;
  }
  return {
    demoEvents,
    demoEventCount,
    demoAgentInsights: remapAgentInsightKeys(AGENT_INSIGHTS, keyMap),
  };
}
