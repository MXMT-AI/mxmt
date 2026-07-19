import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";

const WOH_RED = 60;
const WOH_YELLOW = 45;
const STR_EXPECTED = 15;
const GM_EXPECTED = 40;

const SYSTEM_PROMPT = `Ты стратег по ценообразованию в fashion retail.

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

  const run = await prisma.agentRun.create({
    data: {
      tenantId,
      agentType: "repricing",
      status: "running",
      input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
    },
  });

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
          output: { brands: [], message: "Нет брендов, требующих уценки. WOH у всех в норме." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    const userPrompt = `Бренды для анализа стратегии уценки:

${candidates
  .map(
    (b) =>
      `• ${b.brandName} (id: ${b.brandId}): WOH=${b.wohDays}д, STR=${b.strPercent}%, ` +
      `Trend=${b.trend7dPct > 0 ? "+" : ""}${b.trend7dPct}%, GM=${b.gmPercent}%, ` +
      `Stock=${b.totalStock}шт, FrozenCapital=${b.frozenCapital}грн`
  )
  .join("\n")}

Пороги: woh_red=${WOH_RED}д, woh_yellow=${WOH_YELLOW}д, str_expected=${STR_EXPECTED}%, gm_expected=${GM_EXPECTED}%
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
        current_situation: `WOH: ${b.wohDays}д, STR: ${b.strPercent}%, Тренд: ${b.trend7dPct}%`,
        options: [],
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
