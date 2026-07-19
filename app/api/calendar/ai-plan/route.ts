import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { classify, getThresholds } from "@/lib/classify";
import type { SkuFlag } from "@/lib/analyst-types";
import { requireApiUser } from "@/lib/server-auth";
import { parseAgentJson } from "@/lib/agent-output";

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function generateWeekDates(count: number): { weekKey: string; start: string; end: string }[] {
  const result = [];
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
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({
      weekKey: `w${getISOWeek(start)}`,
      start: fmt(start),
      end: fmt(end),
    });
  }
  return result;
}

// Ukrainian national holidays/events relevant for fashion retail
const UA_EVENTS = [
  { month: 2, day: 14, label: "14.02 День Валентина", retail: "подарунки, аксесуари" },
  { month: 3, day: 8,  label: "08.03 Жіночий день", retail: "подарунки, жіночий одяг" },
  { month: 4, day: 1,  label: "01.04 Квітень", retail: "нові колекції" },
  { month: 5, day: 1,  label: "01.05 День праці", retail: "весняний настрій" },
  { month: 5, day: 9,  label: "09.05 День пам'яті", retail: "стримана реклама" },
  { month: 5, day: 15, label: "15.05 День вишиванки", retail: "вишиванки, українські мотиви" },
  { month: 6, day: 1,  label: "01.06 День дітей", retail: "дитячий одяг, подарунки" },
  { month: 6, day: 28, label: "28.06 День Конституції", retail: "свято, зниження активності" },
  { month: 7, day: 28, label: "28.07 День Державності", retail: "патріотична тематика" },
  { month: 8, day: 24, label: "24.08 День Незалежності", retail: "патріотична тематика, розпродаж" },
  { month: 9, day: 1,  label: "01.09 День знань", retail: "шкільна мода, рюкзаки" },
  { month: 10, day: 14, label: "14.10 День захисника", retail: "подарунки, чоловічий одяг" },
  { month: 11, day: 1, label: "01.11 Зима наближається", retail: "зимові колекції" },
  { month: 12, day: 19, label: "19.12 День Миколая", retail: "подарунки, зимовий одяг" },
  { month: 12, day: 25, label: "25.12 Різдво", retail: "подарунки, святковий одяг" },
];

function getHolidaysForWeek(weekKey: string, year: number): typeof UA_EVENTS {
  // Find which holidays fall in this ISO week
  const isoWeek = parseInt(weekKey.replace("w", ""), 10);
  return UA_EVENTS.filter(({ month, day }) => {
    const d = new Date(year, month - 1, day);
    return getISOWeek(d) === isoWeek;
  });
}

export interface AiPlanChip {
  weekKey: string;
  rowKey: string;
  type: "promo" | "holiday" | "agent" | "warn" | "sale" | "event" | "stock";
  label: string;
}

export async function POST() {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [skus, snapshots, sales30raw, sales7raw, onboarding] = await Promise.all([
    prisma.sku.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "NEW"] } },
      include: { brand: { select: { name: true, leadTimeDays: true } } },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { skuId: true, qtyOnHand: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since30 } },
      _sum: { qtySold: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since7 } },
      _sum: { qtySold: true },
    }),
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
  ]);

  const thresholds = getThresholds(onboarding?.businessModel ?? null);
  const stockMap = Object.fromEntries(snapshots.map((s) => [s.skuId, s.qtyOnHand]));
  const s30Map = Object.fromEntries(sales30raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));
  const s7Map = Object.fromEntries(sales7raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));

  const classified = skus.map((s) => {
    const stock = stockMap[s.id] ?? 0;
    const sold30 = s30Map[s.id] ?? 0;
    const sold7 = s7Map[s.id] ?? 0;
    const leadTime = s.brand?.leadTimeDays ?? 14;
    const avg30 = sold30 / 30;
    const days = avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0;
    return {
      name: s.name,
      brand: s.brand?.name ?? null,
      category: s.category,
      stock,
      sold7,
      sold30,
      daysOfStock: days,
      flag: classify(stock, sold7, sold30, leadTime, thresholds) as SkuFlag,
    };
  });

  const weeks = generateWeekDates(8); // plan for 8 weeks ahead
  const year = new Date().getFullYear();

  // Build holidays list for these weeks
  const holidaysByWeek = weeks.map((w) => ({
    ...w,
    holidays: getHolidaysForWeek(w.weekKey, year),
  }));

  // Top products by flag for the prompt
  const hits = classified.filter((s) => s.flag === "hit").slice(0, 5);
  const stockouts = classified.filter((s) => s.flag === "stockout").slice(0, 5);
  const dead = classified.filter((s) => s.flag === "dead" && s.stock > 0).slice(0, 5);
  const ok = classified.filter((s) => s.flag === "ok").slice(0, 8);

  const systemPrompt = `Ти — AI-маркетолог для fashion retail магазину. Твоя задача — скласти конкретний маркетинговий план на 8 тижнів у вигляді чіпів для календаря.

ПОТОЧНА СИТУАЦІЯ З ТОВАРАМИ:
🔥 Хіти (зростаючий попит, є запас):
${hits.length > 0 ? hits.map((s) => `- ${s.name}${s.brand ? ` (${s.brand})` : ""}: ${s.stock} шт, ${s.sold7} прод/тиждень`).join("\n") : "- немає"}

🛑 Стокаути (ризик закінчення):
${stockouts.length > 0 ? stockouts.map((s) => `- ${s.name}${s.brand ? ` (${s.brand})` : ""}: ${s.daysOfStock} днів залишку`).join("\n") : "- немає"}

💤 Мертвий сток (потрібна акція):
${dead.length > 0 ? dead.map((s) => `- ${s.name}${s.brand ? ` (${s.brand})` : ""}: ${s.stock} шт, 0 продажів 30д`).join("\n") : "- немає"}

✅ Норма (стабільні позиції):
${ok.slice(0, 5).map((s) => `- ${s.name}${s.brand ? ` (${s.brand})` : ""}: ${s.stock} шт`).join("\n")}

БІЗНЕС-МОДЕЛЬ: ${onboarding?.businessModel ?? "не вказано"}`;

  const userPrompt = `Ось наступні 8 тижнів з датами та святами:

${holidaysByWeek.map((w) => {
  const h = w.holidays.length > 0
    ? `\n  Свята: ${w.holidays.map((h) => `${h.label} (для рітейлу: ${h.retail})`).join("; ")}`
    : "";
  return `${w.weekKey} (${w.start}–${w.end})${h}`;
}).join("\n")}

ДОСТУПНІ РЯДКИ КАЛЕНДАРЯ:
- accent: Акцент комунікації (головна тема тижня)
- accent2: Акцент 2 (другорядна тема)
- focus: Фокус бренди (які бренди просуваємо)
- promo: Промо (акції, знижки)
- events: Свята та події
- ban1, ban2: Слайдер банери сайту
- comm: Email / SMS
- ads1, ads2: Рекламні кампанії
- smm1: Акцент тижня в соцмережах
- supply: Постачання

ТИПИ ЧІПІВ: promo, holiday, agent, warn, sale, event, stock

ЗАДАЧА: Склади маркетинговий план — конкретні рекомендації для кожного тижня. Враховуй:
1. Свята → додавай holiday чіп в "events" і тематичні promo в "accent" та "ads"
2. Хіти → посилюй рекламу, додавай в "ads1" та "accent"
3. Стокаути → попереджай warn чіп в "accent" або "supply"
4. Мертвий сток → рекомендуй sale в "promo"
5. Не генеруй більше 2-3 чіпів на тиждень — тільки найважливіше

Відповідай ТІЛЬКИ JSON масивом без зайвого тексту:
[
  { "weekKey": "w19", "rowKey": "events", "type": "holiday", "label": "15.05 Вишиванка" },
  { "weekKey": "w19", "rowKey": "accent", "type": "promo", "label": "Вишиванки — push тижня" },
  ...
]`;

  try {
    const raw = await chat({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
    });

    const { data: chips, error: parseError } = parseAgentJson<AiPlanChip[]>(raw, "array");
    if (!chips) {
      return NextResponse.json({ chips: [], error: parseError ?? "No JSON in response", code: "AI_INVALID_RESPONSE" });
    }

    return NextResponse.json({ chips });
  } catch (err) {
    console.error("[ai-plan]", err);
    return NextResponse.json({ chips: [], error: "AI request failed", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
