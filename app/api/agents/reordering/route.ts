import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";

const WOH_REORDER_THRESHOLD = 30; // trigger reorder analysis when WOH < 30 days

const SYSTEM_PROMPT = `Ты стратег по закупкам в fashion retail.

Получаешь массив брендов с уже посчитанными метриками (WOH, STR, Trend, avgDailyVelocity).
ИИ НЕ считает математику — только интерпретирует готовые цифры и предлагает сценарии дозаказа.

Для каждого бренда генерируй 3 сценария (PESSIMISTIC, REALISTIC, OPTIMISTIC) с оценкой рисков.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "brands": [
    {
      "brand_id": "string",
      "brand_name": "string",
      "current_situation": "1-2 предложения: суть ситуации",
      "scenarios": [
        {
          "scenario_id": 1,
          "type": "PESSIMISTIC",
          "label": "Минимальный дозаказ",
          "qty_multiplier": 0.5,
          "logic": "Покрыть текущий темп на 21 день",
          "woh_after": 20,
          "evaluation": {
            "score": 5,
            "score_label": "Рискованное решение",
            "risk_level": "HIGH",
            "risks": ["string"],
            "pros": ["string"],
            "cons": ["string"],
            "safety_margin": "LOW",
            "recommended": false,
            "confidence": 0.72
          }
        }
      ]
    }
  ]
}

ПРАВИЛА:
- Всегда 3 сценария: PESSIMISTIC, REALISTIC, OPTIMISTIC
- qty_multiplier: относительный объём дозаказа (1.0 = покрыть до 45 дней при текущем темпе)
- recommended: true обычно у REALISTIC, но если Trend > +25% → OPTIMISTIC
- risk_level: HIGH | MEDIUM | LOW
- safety_margin: LOW | GOOD | AGGRESSIVE
- Если тренд падает (Trend < -10%) → указывать в risks что дозаказ не рекомендуется
- woh_after — примерная оценка WOH после дозаказа на основе текущей скорости продаж`;

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
    agentType: "reordering",
    input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const allBrands = await getBrandMetrics(tenantId, asOf, dateFrom);

    // Candidates: low WOH — risk of stockout
    const candidates = allBrands
      .filter((b) => b.skuCount > 0 && b.wohDays < WOH_REORDER_THRESHOLD && b.wohDays > 0)
      .sort((a, b) => a.wohDays - b.wohDays) // most urgent first
      .slice(0, 8);

    if (candidates.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { brands: [], message: "Нет брендов с риском stockout. WOH у всех выше 30 дней." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    const userPrompt = `Бренды для анализа стратегии дозаказа (WOH < ${WOH_REORDER_THRESHOLD} дней):

${candidates
  .map(
    (b) =>
      `• ${b.brandName} (id: ${b.brandId}): WOH=${b.wohDays}д, STR=${b.strPercent}%, ` +
      `Trend=${b.trend7dPct > 0 ? "+" : ""}${b.trend7dPct}%, ` +
      `AvgVelocity=${b.avgDailyVelocity}шт/день, Stock=${b.totalStock}шт`
  )
  .join("\n")}

Порог для дозаказа: WOH < ${WOH_REORDER_THRESHOLD} дней
Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 5000,
      providerOverride,
    });

    const { data: parsed, error: parseError } = parseAgentJson<any>(raw, "object");

    const output = parsed ?? {
      analysis_date: new Date().toISOString().slice(0, 10),
      brands: candidates.map((b) => ({
        brand_id: b.brandId,
        brand_name: b.brandName,
        current_situation: `WOH: ${b.wohDays}д, темп: ${b.avgDailyVelocity}шт/день, тренд: ${b.trend7dPct}%`,
        scenarios: [],
      })),
      message: "Анализ временно недоступен",
    };

    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      candidateCount: candidates.length,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "done", output, finishedAt: new Date() },
    });

    return NextResponse.json({ runId: run.id, ...output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "error", errorMsg: msg, finishedAt: new Date() },
    });
    return serverError(msg);
  }
}
