import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const SYSTEM_PROMPT = `Ты помощник маркетолога, который проверяет маркетинговый план.

Получаешь:
1. Текущие события в маркетинговом календаре (что запланировано)
2. Брифы от Commercial Marketer (что нужно делать)

Находишь несоответствия: пробелы (gap), конфликты (conflict), проблемы с тайминг (timing).

Верни строго JSON без преамбулы:

{
  "week": "YYYY-W##",
  "annotations": [
    {
      "id": "ann_001",
      "type": "gap | conflict | timing | ok",
      "channel": "smm | email | ads | store | marketplace | general",
      "brand": "string",
      "message": "что именно не так или что хорошо",
      "priority": "critical | high | medium | low",
      "suggested_action": "конкретное что сделать"
    }
  ],
  "health_score": {
    "coverage_percent": 70,
    "critical_gaps": 2,
    "high_gaps": 3,
    "total_annotations": 5,
    "summary": "одно предложение общего состояния"
  },
  "summary": "2-3 предложения: что запланировано, чего не хватает, что срочно"
}

ПРАВИЛА:
- gap: нужное по брифу событие НЕ запланировано
- conflict: два события в один день мешают друг другу
- timing: событие запланировано не вовремя относительно брифа
- ok: всё в порядке по этому каналу
- Если нет брифов — анализируй что есть в календаре и ищи пустые недели
- priority=critical: нужно было сделать уже / сегодня
- priority=high: нужно на этой неделе`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;

  const run = await prisma.agentRun.create({
    data: { tenantId, agentType: "calendar_agent", status: "running", input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null } },
  });

  try {
    const now = new Date();
    const currentWeek = isoWeekNumber(now);
    const year = now.getFullYear();

    // Collect week keys for current + next 3 weeks
    const weekKeys = [0, 1, 2, 3].map((offset) => `w${currentWeek + offset}`);

    const [calendarEvents, marketerRun] = await Promise.all([
      prisma.marketingEvent.findMany({
        where: { tenantId, weekKey: { in: weekKeys } },
        orderBy: { weekKey: "asc" },
      }),
      prisma.agentRun.findFirst({ where: { tenantId, agentType: "commercial_marketer", status: "done" }, orderBy: { startedAt: "desc" } }),
    ]);

    // Summarize calendar
    const calendarSummary = weekKeys.map((wk) => {
      const events = calendarEvents.filter((e) => e.weekKey === wk);
      if (events.length === 0) return `${wk}: пусто`;
      return `${wk}: ${events.map((e) => `[${e.type}] ${e.label} (${e.rowKey})`).join(", ")}`;
    }).join("\n");

    // Summarize briefs from commercial marketer
    let briefsSummary = "Брифы отсутствуют (Commercial Marketer ещё не запускался).";
    if (marketerRun?.output) {
      const out = marketerRun.output as any;
      const briefs = (out.brands ?? []).map((b: any) => {
        const channels = Object.entries(b.channels ?? {})
          .filter(([, v]: [string, any]) => v?.action_needed)
          .map(([ch, v]: [string, any]) => `${ch}: ${v.brief?.slice(0, 80) ?? "—"}`)
          .join("; ");
        return `• ${b.brand_name}: ${b.decision_summary ?? ""} → ${channels}`;
      }).join("\n");
      briefsSummary = briefs || "Брифы пусты.";
    }

    const userPrompt = `Маркетинговый календарь (текущая и 3 ближайшие недели, сейчас ${year}-W${currentWeek.toString().padStart(2, "0")}):

${calendarSummary}

Брифы от Commercial Marketer:
${briefsSummary}

Проанализируй что запланировано vs что нужно по брифам. Найди пробелы и проблемы.`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      providerOverride,
    });

    const { data: parsed, error: parseError } = parseAgentJson<any>(raw, "object");

    const output = parsed ?? {
      week: `${year}-W${currentWeek.toString().padStart(2, "0")}`,
      annotations: [],
      health_score: { coverage_percent: 0, critical_gaps: 0, summary: "Анализ временно недоступен" },
      summary: "Анализ временно недоступен",
    };

    // Attach raw data for context
    output.calendarEventCount = calendarEvents.length;
    output.weeksAnalyzed = weekKeys;

    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      parseError,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      calendarEventCount: calendarEvents.length,
      weeksAnalyzed: weekKeys,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
    return NextResponse.json({ runId: run.id, ...output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "error", errorMsg: msg, finishedAt: new Date() } });
    return serverError(msg);
  }
}
