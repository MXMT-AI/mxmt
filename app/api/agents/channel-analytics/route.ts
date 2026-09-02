import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChannelMetrics } from "@/lib/channel-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM_PROMPT = `Ти аналітик каналів продажів у fashion retail. Відповідай українською мовою.

Получаешь готовые метрики по каналам (уже посчитаны в базе).
Твоя задача — сравнить каналы и дать рекомендации.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "channels": [
    {
      "channel": "string",
      "status": "best | normal | weak | inactive",
      "insight": "1-2 предложения что происходит в этом канале",
      "recommendation": "конкретное действие"
    }
  ],
  "top_channel": "string",
  "summary": "2-3 предложения общий вывод по каналам",
  "action": "что нужно сделать прямо сейчас"
}

СТАТУСЫ:
best — самый высокий STR или быстрорастущий канал
normal — работает в пределах нормы
weak — STR низкий относительно других каналов
inactive — нет валовых продаж за 7 дней

ВАЖНО:
- gross_sales — продажи до возвратов, returns — возвраты, net_sales — продажи минус возвраты.
- Возвраты являются бизнес-транзакциями. Никогда не называй отрицательный net_sales или наличие возвратов технической ошибкой, проблемой инвентаризации или отсутствием данных.
- top_channel — лидер по чистому количеству проданных единиц за период. Канал с лучшим STR или выручкой может быть другим; явно объясни эту разницу, если она есть.`;

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
    agentType: "channel_analytics",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const metrics = await getChannelMetrics(tenantId, asOf, dateFrom);

    if (metrics.channels.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { channels: [], message: "В активному імпорті нової бази немає даних про продажі." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, channels: [] });
    }

    const userPrompt = `Метрики по каналам продаж:

${metrics.channels
  .map(
    (c) =>
      `• ${c.channel}: gross_sales_7d=${c.grossSalesLast7d} returns_7d=${c.returnsLast7d} ` +
      `gross_sales_period=${c.grossSalesLast30d} returns_period=${c.returnsLast30d} ` +
      `net_sales_period=${c.salesLast30d} gross_revenue_period=${c.grossRevenue30d.toFixed(0)} ` +
      `returns_revenue_period=${c.returnsRevenue30d.toFixed(0)} net_revenue_period=${c.revenue30d.toFixed(0)} ` +
      `STR=${c.strPercent}%`
  )
  .join("\n")}

Общий сток: ${metrics.totalStock} шт
Лидер по чистому количеству проданных единиц: ${metrics.topChannel}
Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
      providerOverride,
    });

    const { data: parsed, error: parseError } = parseAgentJson<any>(raw, "object");

    const output = parsed ?? {
      channels: metrics.channels.map((c) => ({
        channel: c.channel,
        status: c.grossSalesLast7d > 0 ? "normal" : "inactive",
        insight: `Продажі за 7 днів: ${c.grossSalesLast7d} шт; повернення: ${c.returnsLast7d} шт`,
        recommendation: "Недостатньо даних для рекомендації",
      })),
      top_channel: metrics.topChannel,
      summary: "AI-аналіз тимчасово недоступний; показано розраховані метрики.",
      action: "Перевірити дані за каналами",
    };

    // Attach raw metrics
    output.metrics = metrics;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      provider: providerOverride ?? "openai",
      model: (providerOverride ?? "openai") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      channelCount: metrics.channels.length,
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
