import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAttributeMetrics } from "@/lib/attribute-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";
import { buildAttributeAnalysis } from "@/lib/attribute-analysis";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM_PROMPT = `Ти аналітик асортименту у fashion retail. Відповідай українською мовою.

Получаешь готовые метрики по категориям товаров (уже посчитаны в базе).
STR (Stock Turn Ratio) — % от склада проданный за последние 7 дней.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "by_category": [
    {
      "category": "string",
      "status": "bestseller | normal | slow | dead | stockout | inactive",
      "insight": "1-2 предложения",
      "recommendation": "конкретное действие"
    }
  ],
  "bestsellers": ["category1", "category2"],
  "dead_stock": ["category3"],
  "summary": "2-3 предложения общий вывод",
  "action": "самое важное действие прямо сейчас"
}

СТАТУСЫ:
bestseller — STR >= 25% (продаётся быстро)
normal — STR 5-24%
slow — за вибраний період були продажі, але STR < 5% (медленно, нужна активация)
dead — за весь вибраний період не було жодного валового продажу і є залишок
stockout — залишок 0, але у періоді були продажі
inactive — залишок 0 і продажів у періоді не було

ВАЖНО:
- Статус каждой категории уже рассчитан по данным. Не изменяй и не переосмысливай переданный status.
- gross_sales — продажи до возвратов, returns — возвраты, net_sales — продажи минус возвраты.
- Возвраты являются бизнес-транзакциями и не означают отрицательный спрос или техническую ошибку.
- Не называй категорию dead, если gross_sales_period больше нуля.`;

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
    agentType: "product_attributes",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const metrics = await getAttributeMetrics(tenantId, asOf, dateFrom);

    if (metrics.byCategory.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { by_category: [], message: "Нет данных по категориям в активном импорте новой базы." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, by_category: [] });
    }

    const userPrompt = `Метрики по категориям товаров:

${metrics.byCategory
  .map(
    (c) =>
      `• ${c.attribute}: status=${c.status} SKUs=${c.skuCount} stock=${c.totalStock} ` +
      `gross_sales_7d=${c.grossSalesLast7d} returns_7d=${c.returnsLast7d} ` +
      `gross_sales_period=${c.grossSalesLast30d} returns_period=${c.returnsLast30d} ` +
      `net_sales_period=${c.salesLast30d} STR=${c.strPercent}%`
  )
  .join("\n")}

${
  metrics.bySubcategory.length > 0
    ? `\nПодкатегории:\n${metrics.bySubcategory
        .slice(0, 10)
        .map((c) => `• ${c.attribute}: status=${c.status} STR=${c.strPercent}% gross_sales_7d=${c.grossSalesLast7d} returns_7d=${c.returnsLast7d}`)
        .join("\n")}`
    : ""
}

Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}`;

    let raw = "";
    let parsed: any = null;
    let parseError: string | null = null;
    let providerError: string | null = null;
    try {
      raw = await chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1500,
        providerOverride,
      });
      const result = parseAgentJson<any>(raw, "object");
      parsed = result.data;
      parseError = result.error;
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
    }

    const output: Record<string, any> = buildAttributeAnalysis(metrics.byCategory, parsed);

    output.metrics = metrics;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      providerError,
      provider: providerOverride ?? "openai",
      model: (providerOverride ?? "openai") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      categoryCount: metrics.byCategory.length,
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
