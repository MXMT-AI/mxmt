import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";
import { runAgentBatches } from "@/lib/agent-batching";
import { buildRepricingFallback, type RepricingBrandResult } from "@/lib/agent-fallbacks";
import { getCurrentDependencyRun, resolveAgentRunContext } from "@/lib/agent-dependencies";

export const runtime = "nodejs";
export const maxDuration = 180;

const WOH_RED = 60;
const WOH_YELLOW = 45;
const STR_EXPECTED = 15;
const GM_EXPECTED = 40;

const SYSTEM_PROMPT = `Ти стратег із ціноутворення у fashion retail. Відповідай українською мовою.

Получаешь массив брендов с уже посчитанными метриками (WOH, STR, Trend, GM).
ИИ НЕ считает математику — только интерпретирует готовые цифры и предлагает стратегии.

Для каждого бренда генерируй 3 варианта (AGGRESSIVE, BALANCED, CONSERVATIVE) с оценкой.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "brands": [
    {
      "brand_id": "string",
      "brand_name": "string",
      "current_situation": "1-2 предложения: суть проблемы",
      "options": [
        {
          "option_id": 1,
          "strategy_type": "AGGRESSIVE",
          "label": "Флеш-сейл -35%",
          "action": "FLASH_SALE",
          "discount_percent": 35,
          "duration_days": 14,
          "forecast": {
            "units_to_sell_percent": 41,
            "woh_after": 68,
            "margin_impact_percent": -17
          },
          "evaluation": {
            "score": 8,
            "score_label": "Хорошее решение",
            "pros": ["string"],
            "cons": ["string"],
            "risks": ["string"],
            "recommended": true,
            "confidence": 0.92
          }
        }
      ]
    }
  ]
}

ПРАВИЛА:
- Всегда 3 варианта: AGGRESSIVE, BALANCED, CONSERVATIVE
- action: FLASH_SALE | CLEARANCE | MARKDOWN | VISIBILITY
- recommended: true только у одного варианта на бренд
- score 1-10: основан на данных и соответствии сезону
- WOH > ${WOH_RED} и падающий тренд → рекомендовать AGGRESSIVE
- WOH ${WOH_YELLOW}–${WOH_RED} и стабильный тренд → рекомендовать BALANCED
- WOH < ${WOH_YELLOW} → рекомендовать CONSERVATIVE или VISIBILITY
- Если тренд растёт — предупреждать: скидка не нужна`;

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
    agentType: "repricing",
    input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const allBrands = await getBrandMetrics(tenantId, asOf, dateFrom);

    // Candidates: high WOH or significantly falling trend
    const candidates = allBrands
      .filter((b) => b.skuCount > 0 && (b.wohDays > WOH_YELLOW || b.trend7dPct < -15))
      .slice(0, 8); // cap to avoid token overflow

    if (candidates.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { brands: [], message: "Немає брендів, які потребують уцінки. WOH у межах норми." },
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
        const userPrompt = `Бренди для аналізу стратегії уцінки:\n\n${batch
          .map(
            (b) =>
              `• ${b.brandName} (id: ${b.brandId}): WOH=${b.wohDays}д, STR=${b.strPercent}%, ` +
              `Trend=${b.trend7dPct > 0 ? "+" : ""}${b.trend7dPct}%, GM=${b.gmPercent}%, ` +
              `Stock=${b.totalStock}шт, FrozenCapital=${b.frozenCapital}грн`
          )
          .join("\n")}\n\nПороги: woh_red=${WOH_RED}д, woh_yellow=${WOH_YELLOW}д, str_expected=${STR_EXPECTED}%, gm_expected=${GM_EXPECTED}%\nДата аналізу: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПеріод даних: з ${dateFrom.toISOString().slice(0, 10)}` : ""}`;
        prompts.push(userPrompt);
        const raw = await chat({
          systemPrompt: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: 2400,
          providerOverride,
        });
        rawResponses.push(raw);
        const { data: parsed, error: parseError } = parseAgentJson<{ brands?: RepricingBrandResult[] }>(raw, "object");
        if (parseError) parseErrors.push(parseError);
        const parsedById = new Map((parsed?.brands ?? []).map((brand) => [brand.brand_id, brand]));
        return batch.map((metric) => parsedById.get(metric.brandId) ?? buildRepricingFallback(metric));
      },
      fallbackBatch: (batch) => batch.map(buildRepricingFallback),
    });

    const output: Record<string, any> = {
      analysis_date: (asOf ?? new Date()).toISOString().slice(0, 10),
      brands: batched.results,
      ...(batched.errors.length > 0
        ? { message: "Частину рекомендацій сформовано без AI через недоступність провайдера." }
        : {}),
    };

    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompts: prompts,
      rawResponses,
      parseErrors,
      batchErrors: batched.errors,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
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
