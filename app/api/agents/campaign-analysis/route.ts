import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";

const SYSTEM_PROMPT = `Ты аналитик маркетинговых кампаний в fashion retail.

Получаешь:
1. Активные кампании (что было запланировано по брифам)
2. Текущие метрики брендов (тренды продаж, темп)
3. Количество дней с запуска кампании

Оцениваешь эффективность: кампания на верном пути, опережает, отстаёт или стоит.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "campaigns": [
    {
      "campaign_id": "camp_001",
      "brand_id": "string",
      "brand_name": "string",
      "status": "on_track | ahead | behind | stalled",
      "days_running": 3,
      "performance_score": 7,
      "planned_action": "что планировалось по брифу",
      "actual_observation": "что происходит по цифрам сейчас",
      "next_action": "конкретное следующее действие",
      "urgency": "critical | high | medium | low"
    }
  ],
  "overall_health": "on_track | needs_attention | critical",
  "summary": "2-3 предложения о состоянии всех кампаний"
}

ПРАВИЛА:
- status=on_track: тренд улучшился или стабилен, кампания < 3 дней
- status=ahead: тренд вырос > +15% или продажи ускорились заметно
- status=behind: тренд не улучшился после 3+ дней кампании, продажи стагнируют
- status=stalled: нет данных о продажах или кампания не запущена
- performance_score 1-10: насколько кампания достигает цели по темпу продаж
- overall_health=critical: есть behind/stalled кампании на критичных брендах
- overall_health=needs_attention: есть behind кампании, но не критичные
- overall_health=on_track: всё идёт по плану`;

export async function POST(req: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;

  const run = await prisma.agentRun.create({
    data: { tenantId, agentType: "campaign_analysis", status: "running", input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null } },
  });

  try {
    const [marketerRun, brandMetrics] = await Promise.all([
      prisma.agentRun.findFirst({ where: { tenantId, agentType: "commercial_marketer", status: "done" }, orderBy: { startedAt: "desc" } }),
      getBrandMetrics(tenantId, asOf, dateFrom),
    ]);

    // No commercial_marketer output → no campaigns to track
    if (!marketerRun?.output) {
      const output = {
        analysis_date: new Date().toISOString().slice(0, 10),
        campaigns: [],
        overall_health: "on_track",
        summary: "Активных кампаний нет. Сначала запустите Commercial Marketer для создания брифов.",
        message: "Нет активных кампаний. Запустите Commercial Marketer для создания брифов.",
      };
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
      return NextResponse.json({ runId: run.id, ...output });
    }

    const marketerOut = marketerRun.output as any;
    const brands: any[] = marketerOut.brands ?? [];

    if (brands.length === 0) {
      const output = {
        analysis_date: new Date().toISOString().slice(0, 10),
        campaigns: [],
        overall_health: "on_track",
        summary: "В последнем запуске Commercial Marketer нет брендов с брифами.",
        message: "В Commercial Marketer нет брендов для отслеживания.",
      };
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
      return NextResponse.json({ runId: run.id, ...output });
    }

    const today = new Date();
    const metricsMap = new Map(brandMetrics.map((b) => [b.brandId, b]));

    // Build campaign context for AI
    const campaignLines = brands.map((brand: any) => {
      const metrics = metricsMap.get(brand.brand_id);

      // Find earliest start_date across channels
      const startDates = Object.values(brand.channels ?? {})
        .map((ch: any) => ch?.start_date)
        .filter(Boolean)
        .map((d: string) => new Date(d))
        .filter((d: Date) => !isNaN(d.getTime()));
      const campaignStart = startDates.length > 0 ? new Date(Math.min(...startDates.map((d: Date) => d.getTime()))) : null;
      const daysRunning = campaignStart ? Math.max(0, Math.floor((today.getTime() - campaignStart.getTime()) / 86400000)) : 0;

      // Active channels
      const activeChannels = Object.entries(brand.channels ?? {})
        .filter(([, v]: [string, any]) => v?.action_needed)
        .map(([ch]: [string, any]) => ch)
        .join(", ");

      const metricsStr = metrics
        ? `Тренд=${metrics.trend7dPct > 0 ? "+" : ""}${metrics.trend7dPct}%, Темп=${metrics.avgDailyVelocity}шт/день, WOH=${metrics.wohDays}д`
        : "Метрики недоступны";

      return `• ${brand.brand_name} (id: ${brand.brand_id})
  Срочность: ${brand.urgency ?? "medium"}, Тон: ${brand.overall_tone ?? "—"}
  Каналы: ${activeChannels || "—"}, Запущено: ${daysRunning} дней назад
  Месседж: "${brand.key_message ?? brand.decision_summary ?? "—"}"
  Текущие метрики: ${metricsStr}`;
    }).join("\n\n");

    const userPrompt = `Активные маркетинговые кампании (сегодня: ${today.toISOString().slice(0, 10)}):

${campaignLines}

Оцени статус каждой кампании. Учти: если тренд продаж растёт — кампания работает. Если не растёт после 3+ дней — behind. Если только запустили (< 3 дней) и нет данных — on_track с оговоркой.`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      providerOverride,
    });

    let parsed: any = null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    const output = parsed ?? {
      analysis_date: today.toISOString().slice(0, 10),
      campaigns: brands.map((b: any) => ({
        campaign_id: `camp_${b.brand_id}`,
        brand_id: b.brand_id,
        brand_name: b.brand_name,
        status: "stalled",
        days_running: 0,
        performance_score: 5,
        planned_action: b.decision_summary ?? "—",
        actual_observation: "Анализ временно недоступен",
        next_action: "Проверить данные вручную",
        urgency: b.urgency ?? "medium",
      })),
      overall_health: "needs_attention",
      summary: "Анализ кампаний временно недоступен.",
    };

    output.marketerRunDate = marketerRun.startedAt;
    output.campaignCount = brands.length;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      campaignCount: brands.length,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
    return NextResponse.json({ runId: run.id, ...output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "error", errorMsg: msg, finishedAt: new Date() } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
