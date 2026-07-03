import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getChannelMetrics } from "@/lib/channel-metrics";
import { chat } from "@/lib/ai";

const SYSTEM_PROMPT = `Ты аналитик каналов продаж в fashion retail.

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
inactive — нет продаж за 7 дней`;

export async function POST(req: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;

  const run = await prisma.agentRun.create({
    data: {
      tenantId,
      agentType: "channel_analytics",
      status: "running",
      input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
    },
  });

  try {
    const metrics = await getChannelMetrics(tenantId, asOf, dateFrom);

    if (metrics.channels.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          output: { channels: [], message: "Нет данных о каналах продаж. Синхронизируйте данные из Google Drive." },
          finishedAt: new Date(),
        },
      });
      return NextResponse.json({ runId: run.id, channels: [] });
    }

    const userPrompt = `Метрики по каналам продаж:

${metrics.channels
  .map(
    (c) =>
      `• ${c.channel}: sold7d=${c.salesLast7d} sold30d=${c.salesLast30d} ` +
      `revenue30d=${c.revenue30d.toFixed(0)} STR=${c.strPercent}%`
  )
  .join("\n")}

Общий сток: ${metrics.totalStock} шт
Топ канал по продажам: ${metrics.topChannel}
Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
      providerOverride,
    });

    let parsed: any = null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }

    const output = parsed ?? {
      channels: metrics.channels.map((c) => ({
        channel: c.channel,
        status: c.salesLast7d > 0 ? "normal" : "inactive",
        insight: `Продаж за 7д: ${c.salesLast7d} шт`,
        recommendation: "Нет данных для рекомендации",
      })),
      top_channel: metrics.topChannel,
      summary: "Анализ временно недоступен",
      action: "Проверьте данные по каналам",
    };

    // Attach raw metrics
    output.metrics = metrics;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
