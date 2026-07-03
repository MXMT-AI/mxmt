"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Eye, EyeOff, Sparkles, Pencil } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Chip { t: ChipType; l: string; id?: string }
type ChipType = "promo" | "holiday" | "agent" | "warn" | "sale" | "event" | "stock";

interface Week { k: string; l: string; d: string; m: string }

interface Row { t: "g" | "r"; l: string; k?: string }

interface StockItem {
  brand: string;
  stock: number;
  woh: number | null;
  status: "ok" | "warn" | "crit" | "excess";
}

interface DbEvent {
  id: string;
  weekKey: string;
  rowKey: string;
  type: string;
  label: string;
  source: string;
}

// ─── Dynamic week generation ──────────────────────────────────────────────────

const MONTHS_UK = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function generateWeeks(count: number): Week[] {
  const weeks: Week[] = [];
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const isoWeek = getISOWeek(start);
    const fmt = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    weeks.push({
      k: `w${isoWeek}`,
      l: `Тижд ${isoWeek}`,
      d: `${fmt(start)}–${fmt(end)}`,
      m: MONTHS_UK[start.getMonth()],
    });
  }
  return weeks;
}

const WEEKS: Week[] = generateWeeks(13);

// ─── Demo data remapping ──────────────────────────────────────────────────────
// DEMO_DATA originally used absolute week keys (w14-w26).
// Remap them to start from the current first week so demo is always visible.

function remapWeekKeys<T>(
  data: Record<string, Record<string, T>>,
  oldKeys: string[],
  newKeys: string[]
): Record<string, Record<string, T>> {
  const keyMap: Record<string, string> = {};
  oldKeys.forEach((old, i) => { if (newKeys[i]) keyMap[old] = newKeys[i]; });
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
  oldKeys: string[],
  newKeys: string[]
): Record<string, Chip[]> {
  const keyMap: Record<string, string> = {};
  oldKeys.forEach((old, i) => { if (newKeys[i]) keyMap[old] = newKeys[i]; });
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

// ─── UA Holidays ──────────────────────────────────────────────────────────────

const UA_HOLIDAYS_LIST = [
  { month: 2,  day: 14, label: "14.02 День Валентина 💌" },
  { month: 3,  day: 8,  label: "08.03 Жіночий день 🌸" },
  { month: 5,  day: 1,  label: "01.05 День праці" },
  { month: 5,  day: 9,  label: "09.05 День пам'яті" },
  { month: 5,  day: 15, label: "15.05 День вишиванки 🇺🇦" },
  { month: 6,  day: 1,  label: "01.06 День дітей 🎈" },
  { month: 6,  day: 28, label: "28.06 День Конституції" },
  { month: 7,  day: 28, label: "28.07 День Державності 🇺🇦" },
  { month: 8,  day: 24, label: "24.08 День Незалежності 🇺🇦" },
  { month: 9,  day: 1,  label: "01.09 День знань 📚" },
  { month: 10, day: 14, label: "14.10 День захисника ⚔️" },
  { month: 12, day: 19, label: "19.12 Миколай 🎅" },
  { month: 12, day: 25, label: "25.12 Різдво 🎄" },
];

function getISOWeekFor(year: number, month: number, day: number): number {
  const d = new Date(year, month - 1, day);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function buildHolidayChips(weeks: Week[]): Record<string, Chip[]> {
  const year = new Date().getFullYear();
  const chips: Record<string, Chip[]> = {};
  for (const h of UA_HOLIDAYS_LIST) {
    const w = getISOWeekFor(year, h.month, h.day);
    const weekKey = `w${w}`;
    if (weeks.some((wk) => wk.k === weekKey)) {
      if (!chips[weekKey]) chips[weekKey] = [];
      chips[weekKey].push({ t: "holiday", l: h.label });
    }
  }
  return chips;
}

const HOLIDAY_CHIPS = buildHolidayChips(WEEKS);

const ROWS: Row[] = [
  { t: "g", l: "Загальна інформація" },
  { t: "r", l: "Акцент комунікації", k: "accent" },
  { t: "r", l: "Акцент 2", k: "accent2" },
  { t: "r", l: "Акцент 3", k: "accent3" },
  { t: "r", l: "Фокус бренди", k: "focus" },
  { t: "r", l: "Промо", k: "promo" },
  { t: "r", l: "Події", k: "events" },
  { t: "g", l: "Сайт" },
  { t: "r", l: "Слайдер банер 1", k: "ban1" },
  { t: "r", l: "Слайдер банер 2", k: "ban2" },
  { t: "r", l: "Слайдер банер 3", k: "ban3" },
  { t: "r", l: "Email / SMS", k: "comm" },
  { t: "g", l: "Реклама" },
  { t: "r", l: "Ads 1", k: "ads1" },
  { t: "r", l: "Ads 2", k: "ads2" },
  { t: "r", l: "Ads 3", k: "ads3" },
  { t: "r", l: "Ads 4", k: "ads4" },
  { t: "g", l: "Соцмережі" },
  { t: "r", l: "Акцент тижня", k: "smm1" },
  { t: "r", l: "Зйомки", k: "shoot" },
  { t: "g", l: "Постачання" },
  { t: "r", l: "Постачання", k: "supply" },
];

// ─── Chip colours (dark-theme) ────────────────────────────────────────────────

const CHIP: Record<ChipType, { bg: string; c: string; border: string }> = {
  promo:   { bg: "rgba(96,165,250,0.12)",  c: "#93c5fd", border: "transparent" },
  holiday: { bg: "rgba(167,139,250,0.12)", c: "#c4b5fd", border: "transparent" },
  agent:   { bg: "rgba(74,222,128,0.12)",  c: "#86efac", border: "#4ade80" },
  warn:    { bg: "rgba(248,113,113,0.12)", c: "#fca5a5", border: "#ef4444" },
  sale:    { bg: "rgba(251,191,36,0.12)",  c: "#fde68a", border: "transparent" },
  event:   { bg: "rgba(52,211,153,0.12)",  c: "#6ee7b7", border: "transparent" },
  stock:   { bg: "rgba(192,132,252,0.12)", c: "#e9d5ff", border: "#a855f7" },
};

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

// Remap demo data keys from absolute (w14-w26) to current week keys
const DEMO_OLD_KEYS = ["w14","w15","w16","w17","w18","w19","w20","w21","w22","w23","w24","w25","w26"];
const DEMO_NEW_KEYS = WEEKS.map((w) => w.k);
const DEMO_DATA_MAPPED = remapWeekKeys(DEMO_DATA, DEMO_OLD_KEYS, DEMO_NEW_KEYS);
const AGENT_INSIGHTS_MAPPED = remapAgentInsightKeys(AGENT_INSIGHTS, DEMO_OLD_KEYS, DEMO_NEW_KEYS);

const DEMO_STOCK: StockItem[] = [
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

interface InsightItem { type: "warn" | "agent" | "stock"; brand: string; week: string; title: string; desc: string; impact: string }
const INSIGHTS: InsightItem[] = [
  { type: "warn",  brand: "Великдень 12.04",   week: "Тижд 15",    title: "Зупини рекламу на 2 дні",                   desc: "ZAVOD не працює у свято. Зупини Ads щоб не зжигати бюджет на закритий магазин.", impact: "Економія: ₴2–3K бюджету на рекламу" },
  { type: "agent", brand: "BREDA",             week: "Тижд 15–16", title: "Постачання нових моделей — ідеально для launch", desc: "Нові моделі Breda прийшли. WOH 23 дні — нормальний оборот. Запусти launch campaign.", impact: "Прогноз: +₴40K виручки при бюджеті ₴2K" },
  { type: "warn",  brand: "CHPO",              week: "Тижд 15–18", title: "WOH 13 днів — сток критично низький",        desc: "Ви пушите CHPO у Ads кожного тижня, але WOH лише 13 днів. Ризик стокауту до W19.", impact: "Ризик: втрата ₴150K виручки через відсутність товару" },
  { type: "agent", brand: "KOMONO окуляри",    week: "Тижд 16–21", title: "Температура зростає — push окуляри x3",     desc: "Прогноз погоди: 18–25°C у квітні–травні. KOMONO WOH 29 днів — є запас.", impact: "Рекомендація: збільшити Ads бюджет на окуляри у 3 рази → +₴80K" },
  { type: "warn",  brand: "ZAVOD (власний)",   week: "Тижд 15–26", title: "WOH 119 днів — Outlet недостатньо",         desc: "1088 шт заморожено на ₴3M. Потрібна агресивна кампанія або flash-sale.", impact: "Flash-sale -30% у Тижд 18 → прогноз: звільнення ₴500K капіталу" },
  { type: "stock", brand: "D1 MILANO",         week: "Тижд 17",    title: "Постачання нових моделей — оновіть банери",  desc: "Нові D1 Milano прибувають. WOH 40 днів. Фокус на іміджевий контент.", impact: "Instagram Reels огляд + банер на сайті з 1 дня постачання" },
  { type: "agent", brand: "CHPO літо",         week: "Тижд 19",    title: "Нова літня колекція — готуйте контент заздалегідь", desc: "Постачання CHPO літньої колекції у Тижд 19. Зйомка повинна бути у Тижд 17–18.", impact: "Вчасна підготовка = +30% ефективності launch" },
];

const ST_COLORS = {
  ok:     { bg: "rgba(74,222,128,0.1)",  c: "#86efac", label: "Норма" },
  warn:   { bg: "rgba(251,191,36,0.1)",  c: "#fbbf24", label: "Мало" },
  crit:   { bg: "rgba(248,113,113,0.1)", c: "#fca5a5", label: "Крит." },
  excess: { bg: "rgba(96,165,250,0.1)",  c: "#93c5fd", label: "Надлишок" },
};

// ─── Main component ───────────────────────────────────────────────────────────

interface InsightItem {
  type: "warn" | "agent" | "stock";
  brand: string;
  week: string;
  title: string;
  desc: string;
  impact: string;
}

interface AiPlanChip { weekKey: string; rowKey: string; type: ChipType; label: string }
interface EditModal { id: string; type: ChipType; label: string; row: string; week: string }

export default function MarketingCalendar({ initialEvents }: { initialEvents: DbEvent[] }) {
  const { lang } = useLang();
  const [tab, setTab] = useState<"plan" | "agent" | "stock">("plan");
  const [scrollStart, setScrollStart] = useState(0);
  const [addModal, setAddModal] = useState<{ row: string; week: string } | null>(null);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [newEvent, setNewEvent] = useState<{ type: ChipType; label: string }>({ type: "promo", label: "" });
  const [dbEvents, setDbEvents] = useState<DbEvent[]>(initialEvents);
  const [stockData, setStockData] = useState<StockItem[]>(DEMO_STOCK);
  const [insights, setInsights] = useState<InsightItem[]>(INSIGHTS);
  const [aiChips, setAiChips] = useState<AiPlanChip[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllStock, setShowAllStock] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/stock")
      .then((r) => r.json())
      .then((data: StockItem[]) => { if (data.length > 0) setStockData(data); })
      .catch(() => {});
  }, []);

  // Load real AI insights; fall back to INSIGHTS demo data if none
  useEffect(() => {
    fetch("/api/calendar/insights")
      .then((r) => r.json())
      .then((data: InsightItem[]) => { if (data.length > 0) setInsights(data); })
      .catch(() => {});
  }, []);

  const visibleWeeks = WEEKS.slice(scrollStart, scrollStart + 4);

  const getChips = (rowKey: string, weekKey: string): Chip[] => {
    // Demo template (remapped to current weeks)
    const demo = showDemo ? ((DEMO_DATA_MAPPED[rowKey] ?? {})[weekKey] ?? []) : [];

    // User's own events from DB
    const user = dbEvents
      .filter((e) => e.rowKey === rowKey && e.weekKey === weekKey)
      .map((e) => ({ t: e.type as ChipType, l: e.label, id: e.id }));

    // UA holidays always visible in "events" row
    const holidays = rowKey === "events" ? (HOLIDAY_CHIPS[weekKey] ?? []) : [];

    // Agent tab chips
    let agent: Chip[] = [];
    if (tab === "agent") {
      // 1. AI-generated plan chips (highest priority)
      const aiRowChips = aiChips
        .filter((c) => c.weekKey === weekKey && c.rowKey === rowKey)
        .map((c) => ({ t: c.type, l: c.label }));

      // 2. Real insight chips from classify API
      const insightChips = insights
        .filter((ins) => (ins as InsightItem & { weekKey?: string; rowKey?: string }).weekKey === weekKey
          && (ins as InsightItem & { weekKey?: string; rowKey?: string }).rowKey === rowKey)
        .map((ins) => ({
          t: ins.type as ChipType,
          l: ins.brand.length > 18 ? ins.brand.slice(0, 16) + "…" : ins.brand,
        }));

      // 3. Fallback to demo if showDemo and no real data
      const fallback = showDemo ? (AGENT_INSIGHTS_MAPPED[`${weekKey}_${rowKey}`] ?? []) : [];

      agent = aiRowChips.length > 0 ? aiRowChips
        : insightChips.length > 0 ? insightChips
        : fallback;
    }

    return [...holidays, ...demo, ...user, ...agent];
  };

  const addEvent = async () => {
    if (!newEvent.label.trim() || !addModal || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekKey: addModal.week, rowKey: addModal.row, type: newEvent.type, label: newEvent.label }),
      });
      if (res.ok) {
        const saved: DbEvent = await res.json();
        setDbEvents((prev) => [...prev, saved]);
      }
    } finally {
      setSaving(false);
      setNewEvent({ type: "promo", label: "" });
      setAddModal(null);
    }
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
    setDbEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const saveEdit = async () => {
    if (!editModal || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${editModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: editModal.type, label: editModal.label }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDbEvents((prev) => prev.map((e) => e.id === updated.id ? updated : e));
      }
    } finally {
      setSaving(false);
      setEditModal(null);
    }
  };

  const generateAiPlan = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/calendar/ai-plan", { method: "POST" });
      const data = await res.json();
      if (data.chips?.length > 0) {
        setAiChips(data.chips);
        setTab("agent");
      }
    } catch {
      // silent fail
    } finally {
      setAiLoading(false);
    }
  };

  const userCount = dbEvents.length;
  const labels = {
    plan:  lang === "uk" ? "Мій план"       : "My Plan",
    agent: lang === "uk" ? "Аналіз агента"  : "Agent Analysis",
    stock: lang === "uk" ? "Залишки"        : "Stock",
    addEvent: lang === "uk" ? "+ Додати подію" : "+ Add event",
    earlier:  lang === "uk" ? "← Раніше"      : "← Earlier",
    later:    lang === "uk" ? "Пізніше →"     : "Later →",
    channel:  lang === "uk" ? "Канал"         : "Channel",
    events_in_plan:   lang === "uk" ? "Подій у плані"     : "Events in plan",
    agent_tips:       lang === "uk" ? "Порад агента"      : "Agent tips",
    warnings:         lang === "uk" ? "Попереджень"       : "Warnings",
    forecast:         lang === "uk" ? "Прогноз виручки"   : "Revenue forecast",
    agent_analysis:   lang === "uk" ? "Детальний аналіз агента" : "Detailed agent analysis",
    agent_insights_h: lang === "uk" ? "Інсайти агента"   : "Agent insights",
    stock_title:      lang === "uk" ? "Статус залишків (реальні дані)" : "Stock status (live data)",
    add_event_title:  lang === "uk" ? "Додати подію"  : "Add event",
    type_label:       lang === "uk" ? "Тип"           : "Type",
    channel_label:    lang === "uk" ? "Канал"         : "Channel",
    week_label:       lang === "uk" ? "Тиждень"       : "Week",
    name_label:       lang === "uk" ? "Назва"         : "Name",
    name_ph:          lang === "uk" ? "напр. -20% на годинники KOMONO" : "e.g. -20% on KOMONO watches",
    cancel:           lang === "uk" ? "Скасувати" : "Cancel",
    add_btn:          lang === "uk" ? "Додати" : "Add",
  };

  const typeOptions: { v: ChipType; l: string }[] = [
    { v: "promo",   l: lang === "uk" ? "Акція / промо"       : "Promo" },
    { v: "holiday", l: lang === "uk" ? "Свято / подія"       : "Holiday" },
    { v: "sale",    l: lang === "uk" ? "Розпродаж"           : "Sale" },
    { v: "event",   l: lang === "uk" ? "Колекція / launch"   : "Collection / launch" },
    { v: "stock",   l: lang === "uk" ? "Закупівля"           : "Stock" },
    { v: "warn",    l: lang === "uk" ? "Попередження"        : "Warning" },
  ];

  return (
    <div className="p-6 max-w-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-1">
            {lang === "uk" ? "Маркетинговий планер" : "Marketing Planner"}
          </div>
          <h1 className="text-xl font-bold text-white">
            {lang === "uk" ? "Календар активностей" : "Activity Calendar"}
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">
            {WEEKS[0] && WEEKS[WEEKS.length - 1]
              ? `${WEEKS[0].d.split("–")[0]} — ${WEEKS[WEEKS.length - 1].d.split("–")[1]}`
              : ""}
            {" · "}
            {lang === "uk" ? "Реальні дані" : "Live data"}
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {/* AI Plan button */}
          <button
            onClick={generateAiPlan}
            disabled={aiLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              aiChips.length > 0
                ? "bg-[#a78bfa]/10 border-[#a78bfa]/30 text-[#a78bfa]"
                : "bg-[var(--input-bg)] border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)]"
            } disabled:opacity-50`}
            title={lang === "uk" ? "Згенерувати план через AI" : "Generate AI plan"}
          >
            <Sparkles size={12} className={aiLoading ? "animate-pulse" : ""} />
            {aiLoading
              ? (lang === "uk" ? "Генеруємо…" : "Generating…")
              : aiChips.length > 0
              ? (lang === "uk" ? "AI план ✓" : "AI plan ✓")
              : (lang === "uk" ? "AI план" : "AI plan")}
          </button>

          {/* Demo toggle */}
          <button
            onClick={() => setShowDemo((v) => !v)}
            title={showDemo
              ? (lang === "uk" ? "Сховати демо-шаблон" : "Hide demo template")
              : (lang === "uk" ? "Показати демо-шаблон" : "Show demo template")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              showDemo
                ? "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]"
                : "bg-[var(--input-bg)] border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)]"
            }`}
          >
            {showDemo ? <Eye size={12} /> : <EyeOff size={12} />}
            {lang === "uk" ? "Шаблон" : "Template"}
          </button>

          {/* Tabs */}
          <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            {(["plan", "agent", "stock"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === t ? "bg-[#00e5c4]/10 text-[#00e5c4]" : "text-[var(--muted)] hover:text-white"}`}>
                {labels[t]}
              </button>
            ))}
          </div>
          <button onClick={() => setAddModal({ row: "accent", week: visibleWeeks[0]?.k ?? WEEKS[0]?.k ?? "w1" })}
            className="px-3 py-1.5 text-xs font-medium bg-[#00e5c4]/10 text-[#00e5c4] border border-[#00e5c4]/20 rounded-lg hover:bg-[#00e5c4]/20 transition-colors">
            {labels.addEvent}
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { v: `${(showDemo ? 68 : 0) + userCount}`, l: labels.events_in_plan, c: "text-white" },
          { v: String(insights.filter((i) => i.type === "agent").length), l: labels.agent_tips, c: "text-[#86efac]" },
          { v: String(insights.filter((i) => i.type === "warn").length),  l: labels.warnings,   c: "text-[#fca5a5]" },
        ].map((s, i) => (
          <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className={`text-lg font-bold font-mono ${s.c}`}>{s.v}</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {([
          { l: lang === "uk" ? "Акція/промо" : "Promo",         t: "promo"   },
          { l: lang === "uk" ? "Свято"       : "Holiday",       t: "holiday" },
          { l: lang === "uk" ? "Розпродаж"   : "Sale",          t: "sale"    },
          { l: lang === "uk" ? "Подія"       : "Event",         t: "event"   },
          { l: lang === "uk" ? "Порада агента" : "Agent tip",   t: "agent"   },
          { l: lang === "uk" ? "Попередження" : "Warning",      t: "warn"    },
          { l: lang === "uk" ? "Закупівля"    : "Stock",        t: "stock"   },
        ] as { l: string; t: ChipType }[]).map((lg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: CHIP[lg.t].bg, border: "1px solid rgba(255,255,255,0.1)" }} />
            <span className="text-[10px] text-[var(--muted)]">{lg.l}</span>
          </div>
        ))}
      </div>

      {/* ── Week nav ── */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setScrollStart(Math.max(0, scrollStart - 1))} disabled={scrollStart === 0}
          className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} /> {labels.earlier}
        </button>
        <span className="text-[10px] font-mono text-[var(--subtle)]">
          {visibleWeeks[0]?.d} — {visibleWeeks[visibleWeeks.length - 1]?.d}
        </span>
        <button onClick={() => setScrollStart(Math.min(WEEKS.length - 4, scrollStart + 1))} disabled={scrollStart >= WEEKS.length - 4}
          className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white disabled:opacity-30 transition-colors">
          {labels.later} <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Calendar grid ── */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] mb-5">
        <table className="w-full text-xs border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 160 }} />
            {visibleWeeks.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-[var(--surface2)] text-[var(--muted)] font-medium p-3 text-left border-b border-r border-[var(--border)] sticky left-0 z-10 text-sm">
                {labels.channel}
              </th>
              {visibleWeeks.map((w) => (
                <th key={w.k} className="bg-[var(--surface2)] text-[var(--muted)] font-medium p-2 text-center border-b border-r border-[var(--border)]">
                  <div className="font-bold text-sm text-white">{w.m}</div>
                  <div className="text-xs text-[var(--subtle)] mt-0.5">{w.l}</div>
                  <div className="text-[11px] text-[var(--subtle)]">{w.d}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              if (row.t === "g") {
                return (
                  <tr key={ri}>
                    <td colSpan={visibleWeeks.length + 1}
                      className="bg-[var(--surface)] text-xs font-bold text-[var(--subtle)] uppercase tracking-wider p-2 pl-4 border-b border-[var(--border-faint)]">
                      {row.l}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={ri} className="hover:bg-[var(--input-bg)]">
                  <td className="p-2 pl-4 text-[var(--muted)] font-medium border-b border-r border-[var(--border-faint)] bg-[var(--row)] sticky left-0 z-10 text-xs">
                    {row.l}
                  </td>
                  {visibleWeeks.map((w) => {
                    const chips = getChips(row.k!, w.k);
                    return (
                      <td key={w.k} className="p-1.5 border-b border-r border-[var(--border-faint)] align-top bg-[var(--bg)]">
                        {chips.map((chip, ci) => {
                          const s = CHIP[chip.t] ?? CHIP.promo;
                          const isUser = !!chip.id;
                          return (
                            <div key={ci}
                              className={`group relative rounded px-2 py-1 mb-1 text-xs font-medium flex items-center justify-between gap-1 ${isUser ? "cursor-pointer" : "cursor-default"}`}
                              style={{ background: s.bg, color: s.c, borderLeft: s.border !== "transparent" ? `2px solid ${s.border}` : "none" }}
                              title={chip.l}>
                              <span
                                className="truncate leading-snug flex-1"
                                onClick={() => isUser && chip.id && setEditModal({
                                  id: chip.id,
                                  type: chip.t,
                                  label: chip.l,
                                  row: row.k!,
                                  week: w.k,
                                })}
                              >
                                {chip.l}
                              </span>
                              {isUser && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
                                  <button
                                    onClick={() => chip.id && setEditModal({ id: chip.id, type: chip.t, label: chip.l, row: row.k!, week: w.k })}
                                    className="p-0.5 hover:opacity-70"
                                  >
                                    <Pencil size={9} />
                                  </button>
                                  <button onClick={() => deleteEvent(chip.id!)} className="p-0.5 hover:opacity-70">
                                    <X size={9} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => setAddModal({ row: row.k!, week: w.k })}
                          className="text-xs text-[var(--subtle)] hover:text-[var(--muted)] w-full text-left mt-0.5 transition-colors">
                          +
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Bottom panels ── */}
      <div className={`grid gap-4 ${tab === "plan" ? "grid-cols-2" : "grid-cols-1"}`}>
        {(tab === "plan" || tab === "agent") && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">
                {tab === "agent" ? labels.agent_analysis : labels.agent_insights_h}
              </h3>
              {insights.length > 10 && (
                <span className="text-[10px] font-mono text-[var(--subtle)]">
                  {showAllInsights ? insights.length : Math.min(10, insights.length)}/{insights.length}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {(showAllInsights ? insights : insights.slice(0, 10)).map((ins, i) => {
                const c = { warn: { bg: "rgba(248,113,113,0.08)", border: "#ef4444", icon: "!", ic: "#fca5a5" }, agent: { bg: "rgba(74,222,128,0.08)", border: "#4ade80", icon: "+", ic: "#86efac" }, stock: { bg: "rgba(96,165,250,0.08)", border: "#60a5fa", icon: "↑", ic: "#93c5fd" } }[ins.type as "warn" | "agent" | "stock"] ?? { bg: "rgba(74,222,128,0.08)", border: "#4ade80", icon: "+", ic: "#86efac" };
                return (
                  <div key={i} className="rounded-lg p-3 flex gap-3" style={{ background: c.bg, borderLeft: `3px solid ${c.border}` }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: `${c.border}22`, color: c.ic }}>
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text)]">{ins.brand}</span>
                        <span className="text-[10px] text-[var(--muted)]">{ins.week}</span>
                      </div>
                      <div className="text-[11px] font-medium text-[var(--text)] mb-0.5">{ins.title}</div>
                      <div className="text-[10px] text-[var(--muted)] mb-0.5">{ins.desc}</div>
                      <div className="text-[10px] font-medium" style={{ color: c.ic }}>{ins.impact}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {insights.length > 10 && (
              <button
                onClick={() => setShowAllInsights((v) => !v)}
                className="mt-3 w-full text-xs text-[var(--muted)] hover:text-[var(--text)] py-2 border-t border-[var(--border-faint)] transition-colors"
              >
                {showAllInsights
                  ? (lang === "uk" ? "Сховати ▲" : "Show less ▲")
                  : (lang === "uk" ? `Показати ще ${insights.length - 10} ▼` : `Show ${insights.length - 10} more ▼`)}
              </button>
            )}
          </div>
        )}

        {(tab === "plan" || tab === "stock") && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">{labels.stock_title}</h3>
              {stockData.length > 10 && (
                <span className="text-[10px] font-mono text-[var(--subtle)]">
                  {showAllStock ? stockData.length : Math.min(10, stockData.length)}/{stockData.length}
                </span>
              )}
            </div>
            <div className="space-y-0">
              {(showAllStock ? stockData : stockData.slice(0, 10)).map((s, i) => {
                const sc = ST_COLORS[s.status];
                const barW = Math.min(100, Math.max(4, (s.woh ?? 0) * 0.8));
                return (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-[var(--border-faint)] last:border-0 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text)]">{s.brand}</div>
                      <div className="text-[10px] text-[var(--muted)] font-mono">
                        WOH {s.woh ?? "—"}д · {s.stock} шт
                      </div>
                      <div className="h-1 rounded-full mt-1 bg-white/[0.06]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: sc.c }} />
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: sc.bg, color: sc.c }}>
                      {sc.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {stockData.length > 10 && (
              <button
                onClick={() => setShowAllStock((v) => !v)}
                className="mt-2 w-full text-xs text-[var(--muted)] hover:text-[var(--text)] py-2 border-t border-[var(--border-faint)] transition-colors"
              >
                {showAllStock
                  ? (lang === "uk" ? "Сховати ▲" : "Show less ▲")
                  : (lang === "uk" ? `Показати ще ${stockData.length - 10} ▼` : `Show ${stockData.length - 10} more ▼`)}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit event modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setEditModal(null)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="text-white font-semibold">
                {lang === "uk" ? "Редагувати подію" : "Edit event"}
              </h4>
              <button onClick={() => setEditModal(null)} className="text-[var(--muted)] hover:text-white"><X size={16} /></button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.type_label}</label>
                <select
                  value={editModal.type}
                  onChange={(e) => setEditModal({ ...editModal, type: e.target.value as ChipType })}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none"
                >
                  {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.name_label}</label>
                <input
                  type="text"
                  value={editModal.label}
                  onChange={(e) => setEditModal({ ...editModal, label: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#00e5c4]/40"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditModal(null)}
                className="flex-1 py-2 text-sm text-[var(--muted)] border border-[var(--border)] rounded-lg hover:bg-white/[0.04] transition-colors">
                {labels.cancel}
              </button>
              <button onClick={saveEdit} disabled={saving || !editModal.label.trim()}
                className="flex-1 py-2 text-sm text-[#0d1117] bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-50 rounded-lg font-semibold transition-colors">
                {saving ? "…" : (lang === "uk" ? "Зберегти" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add event modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setAddModal(null)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="text-white font-semibold">{labels.add_event_title}</h4>
              <button onClick={() => setAddModal(null)} className="text-[var(--muted)] hover:text-white"><X size={16} /></button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.type_label}</label>
                <select value={newEvent.type} onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as ChipType })}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
                  {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.channel_label}</label>
                <select value={addModal.row} onChange={(e) => setAddModal({ ...addModal, row: e.target.value })}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
                  {ROWS.filter((r) => r.t === "r").map((r) => <option key={r.k} value={r.k}>{r.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.week_label}</label>
                <select value={addModal.week} onChange={(e) => setAddModal({ ...addModal, week: e.target.value })}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
                  {WEEKS.map((w) => <option key={w.k} value={w.k}>{w.l} · {w.d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{labels.name_label}</label>
                <input type="text" value={newEvent.label}
                  onChange={(e) => setNewEvent({ ...newEvent, label: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addEvent()}
                  placeholder={labels.name_ph}
                  className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#00e5c4]/40 placeholder:text-[#3d444d]" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setAddModal(null)}
                className="flex-1 py-2 text-sm text-[var(--muted)] border border-[var(--border)] rounded-lg hover:bg-white/[0.04] transition-colors">
                {labels.cancel}
              </button>
              <button onClick={addEvent} disabled={saving || !newEvent.label.trim()}
                className="flex-1 py-2 text-sm text-[#0d1117] bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-50 rounded-lg font-semibold transition-colors">
                {saving ? "…" : labels.add_btn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
