import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";

export const runtime = "nodejs";
export const maxDuration = 180;

const THRESHOLDS = {
  woh_red: 60,
  woh_yellow: 45,
  woh_green: 21,
  str_expected: 15,
  gm_expected: 40,
};

const SYSTEM_PROMPT = `Ты аналитик склада в fashion retail.

Получаешь готовые метрики брендов (WOH, STR, Trend, GM — уже посчитаны в базе).
Твоя задача — только ИНТЕРПРЕТИРОВАТЬ цифры и определить статус каждого бренда.

Верни строго JSON массив без преамбулы:

[
  {
    "brand_id": "string",
    "brand_name": "string",
    "status": "critical | warning | balanced | excellent",
    "analysis": "2-3 предложения: что происходит и почему",
    "confidence": 0.9,
    "metrics_evaluation": {
      "woh_status": "red | yellow | green",
      "str_status": "very_low | low | normal | high | very_high",
      "trend_status": "falling | stable | rising",
      "gm_status": "low | normal | high"
    },
    "suggested_actions": [],
    "urgency": "immediate | today | this_week | low"
  }
]

ПРАВИЛА СТАТУСА:
CRITICAL: WOH > woh_red И STR < str_expected×0.5 | ИЛИ WOH < 7 И тренд растёт
WARNING: WOH > woh_yellow | STR на 20-50% ниже expected | тренд -10%...-20%
BALANCED: WOH между green и yellow, STR ±20% от expected
EXCELLENT: WOH < 20 И тренд >+20% | ИЛИ STR > expected×1.5

suggested_actions: "repricing" | "reordering" | "clearance" | "visibility"`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;

  const { run, response: runResponse } = await startAgentRun({
    tenantId,
    agentType: "inventory_analyst",
    input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const metrics = await getBrandMetrics(tenantId, asOf, dateFrom);

    if (metrics.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { brands: [], message: "Нет брендов с товарами" },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { input: { brandCount: metrics.length, provider: providerOverride ?? "anthropic" } },
    });

    const analysisDateStr = (asOf ?? new Date()).toISOString().slice(0, 10);
    const userPrompt = `Пороги: WOH red=${THRESHOLDS.woh_red}d yellow=${THRESHOLDS.woh_yellow}d green=${THRESHOLDS.woh_green}d | STR expected=${THRESHOLDS.str_expected}% | GM expected=${THRESHOLDS.gm_expected}%
Дата анализа: ${analysisDateStr}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}

Бренды:
${metrics
  .map(
    (m) =>
      `• ${m.brandName} (id: ${m.brandId}): stock=${m.totalStock} SKUs=${m.skuCount} ` +
      `WOH=${m.wohDays}d STR=${m.strPercent}% trend=${m.trend7dPct}% GM=${m.gmPercent}% ` +
      `sold7d=${m.salesLast7d} sold30d=${m.salesLast30d}`
  )
  .join("\n")}`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      providerOverride,
    });

    const { data: parsedData, error: parseError } = parseAgentJson<any[]>(raw, "array");
    const parsed = parsedData ?? metrics.map((m) => ({
        brand_id: m.brandId,
        brand_name: m.brandName,
        status: "balanced",
        analysis: "Анализ временно недоступен",
        confidence: 0.5,
        metrics_evaluation: { woh_status: "green", str_status: "normal", trend_status: "stable", gm_status: "normal" },
        suggested_actions: [],
        urgency: "low",
      }));

    // Attach computed metrics to each brand result
    const output = parsed.map((p: any) => {
      const metric = metrics.find((m) => m.brandId === p.brand_id || m.brandName === p.brand_name);
      return { ...p, metrics: metric ?? null };
    });

    const _debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed.length > 0,
      brandCount: metrics.length,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "done", output: { brands: output, _debug }, finishedAt: new Date() },
    });

    return NextResponse.json({ runId: run.id, brands: output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "error", errorMsg: msg, finishedAt: new Date() },
    });
    return serverError(msg);
  }
}

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  // Return last run for each agent type
  const agentTypes = [
    "inventory_analyst",
    "channel_analytics",
    "product_attributes",
    "repricing",
    "reordering",
    "commercial_marketer",
    "calendar_agent",
    "campaign_analysis",
    "weekly_report",
  ];

  const runs = await prisma.agentRun.findMany({
    where: { tenantId, agentType: { in: agentTypes } },
    orderBy: { startedAt: "desc" },
  });

  // Get latest run per agent type
  const latest: Record<string, any> = {};
  for (const run of runs) {
    if (!latest[run.agentType]) latest[run.agentType] = run;
  }

  return NextResponse.json(latest);
}
