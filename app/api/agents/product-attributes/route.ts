import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAttributeMetrics } from "@/lib/attribute-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Ты аналитик ассортимента в fashion retail.

Получаешь готовые метрики по категориям товаров (уже посчитаны в базе).
STR (Stock Turn Ratio) — % от склада проданный за последние 7 дней.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "by_category": [
    {
      "category": "string",
      "status": "bestseller | normal | slow | dead",
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
slow — STR 1-4% (медленно, нужна активация)
dead — STR < 1% (стоит на складе, нужна уценка/акция)`;

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
    input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const metrics = await getAttributeMetrics(tenantId, asOf, dateFrom);

    if (metrics.byCategory.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { by_category: [], message: "Нет данных по категориям. Синхронизируйте данные из Google Drive." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, by_category: [] });
    }

    const userPrompt = `Метрики по категориям товаров:

${metrics.byCategory
  .map(
    (c) =>
      `• ${c.attribute}: SKUs=${c.skuCount} stock=${c.totalStock} ` +
      `sold7d=${c.salesLast7d} sold30d=${c.salesLast30d} STR=${c.strPercent}%`
  )
  .join("\n")}

${
  metrics.bySubcategory.length > 0
    ? `\nПодкатегории:\n${metrics.bySubcategory
        .slice(0, 10)
        .map((c) => `• ${c.attribute}: STR=${c.strPercent}% sold7d=${c.salesLast7d}`)
        .join("\n")}`
    : ""
}

Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
      providerOverride,
    });

    const { data: parsed, error: parseError } = parseAgentJson<any>(raw, "object");

    const output = parsed ?? {
      by_category: metrics.byCategory.map((c) => ({
        category: c.attribute,
        status: c.status,
        insight: `STR: ${c.strPercent}%, продаж за 7д: ${c.salesLast7d} шт`,
        recommendation: "Анализ временно недоступен",
      })),
      bestsellers: metrics.topCategories,
      dead_stock: metrics.deadCategories,
      summary: "Анализ временно недоступен",
      action: "Проверьте данные по категориям",
    };

    output.metrics = metrics;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
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
