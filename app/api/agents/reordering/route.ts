import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";
import { runAgentBatches } from "@/lib/agent-batching";
import {
  buildReorderingFallback,
  normalizeReorderingResult,
  type ReorderingBrandResult,
} from "@/lib/agent-fallbacks";
import { getCurrentDependencyRun, resolveAgentRunContext } from "@/lib/agent-dependencies";

export const runtime = "nodejs";
export const maxDuration = 180;

const WOH_REORDER_THRESHOLD = 30; // trigger reorder analysis when WOH < 30 days

const SYSTEM_PROMPT = `Ти стратег із закупівель у fashion retail. Відповідай українською мовою.

Получаешь массив брендов с уже посчитанными метриками (DOH, STR, Trend, avgDailyVelocity).
DOH — количество дней запаса при текущей чистой скорости продаж с учетом возвратов.
ИИ НЕ считает математику и не выбирает финальную рекомендацию — только интерпретирует цифры и описывает риски. Сервер фиксирует множители, прогноз DOH, оценки и рекомендацию.

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
- qty_multiplier будет перепроверен сервером: PESSIMISTIC=0.5, REALISTIC=1.0, OPTIMISTIC=1.5; 1.0 означает покрытие до 45 дней
- recommended и score определяет сервер: при Trend < -10% → PESSIMISTIC, при Trend > +25% → OPTIMISTIC, иначе REALISTIC
- risk_level: HIGH | MEDIUM | LOW
- safety_margin: LOW | GOOD | AGGRESSIVE
- Если тренд падает (Trend < -10%) → указывать в risks что дозаказ не рекомендуется
- DOH после дозаказа рассчитывает сервер; не придумывай lead time или MOQ поставщика`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;
  const context = await resolveAgentRunContext(tenantId, body);
  const inventoryState = await getCurrentDependencyRun(tenantId, "inventory_analyst", context);
  if (!inventoryState.ready) {
    return apiError(
      "Спочатку запустіть Inventory Analyst для поточного імпорту та періоду.",
      409,
      "AGENT_DEPENDENCY_NOT_READY",
      [`Inventory Analyst: ${inventoryState.reason}`]
    );
  }

  const { run, response: runResponse } = await startAgentRun({
    tenantId,
    agentType: "reordering",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const allBrands = await getBrandMetrics(tenantId, asOf, dateFrom);

    // Candidates: low days of inventory (DOH) — risk of stockout
    const candidates = allBrands
      .filter((b) => b.skuCount > 0 && b.wohDays < WOH_REORDER_THRESHOLD && b.wohDays > 0)
      .sort((a, b) => a.wohDays - b.wohDays) // most urgent first
      .slice(0, 8);

    if (candidates.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { brands: [], message: "Немає брендів із ризиком дефіциту. Дні запасу (DOH) у всіх понад 30 днів." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    const prompts: string[] = [];
    const rawResponses: string[] = [];
    const parseErrors: string[] = [];
    const batched = await runAgentBatches({
      items: candidates,
      batchSize: 2,
      concurrency: 2,
      runBatch: async (batch) => {
        const userPrompt = `Бренди для аналізу поповнення (DOH < ${WOH_REORDER_THRESHOLD} днів):\n\n${batch
          .map(
            (b) =>
              `• ${b.brandName} (id: ${b.brandId}): DOH=${b.wohDays}д, STR=${b.strPercent}%, ` +
              `Trend=${b.trend7dPct > 0 ? "+" : ""}${b.trend7dPct}%, ` +
              `AvgVelocity=${b.avgDailyVelocity}шт/день, Stock=${b.totalStock}шт`
          )
          .join("\n")}\n\nДата аналізу: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПеріод даних: з ${dateFrom.toISOString().slice(0, 10)}` : ""}`;
        prompts.push(userPrompt);
        const raw = await chat({
          systemPrompt: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: 2400,
          providerOverride,
        });
        rawResponses.push(raw);
        const { data: parsed, error } = parseAgentJson<{ brands?: ReorderingBrandResult[] }>(raw, "object");
        if (error) parseErrors.push(error);
        const parsedById = new Map((parsed?.brands ?? []).map((brand) => [brand.brand_id, brand]));
        return batch.map((metric) => normalizeReorderingResult(metric, parsedById.get(metric.brandId)));
      },
      fallbackBatch: (batch) => batch.map(buildReorderingFallback),
    });

    const output: Record<string, any> = {
      analysis_date: (asOf ?? new Date()).toISOString().slice(0, 10),
      brands: batched.results,
      ...(batched.errors.length > 0
        ? { message: "Частину сценаріїв сформовано без AI через недоступність провайдера." }
        : {}),
    };

    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompts: prompts,
      rawResponses,
      parseErrors,
      batchErrors: batched.errors,
      provider: providerOverride ?? "openai",
      model: (providerOverride ?? "openai") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: batched.errors.length === 0 && parseErrors.length === 0,
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
