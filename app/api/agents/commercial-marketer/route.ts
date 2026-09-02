import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";
import { startAgentRun } from "@/lib/agent-runs";
import { runAgentBatches } from "@/lib/agent-batching";
import {
  buildCommercialFallback,
  extractCommercialDecisions,
  normalizeCommercialBrief,
} from "@/lib/agent-fallbacks";
import { getCurrentDependencyRun, resolveAgentRunContext } from "@/lib/agent-dependencies";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM_PROMPT = `Ти комерційний маркетолог у fashion retail. Відповідай українською мовою.

Ты получаешь список брендов с валидированными автоматическими рекомендациями по уценке, видимости или дозаказу и создаёшь конкретные задачи для каждого маркетингового канала.

КРИТИЧЕСКИ ВАЖНО: НЕ используй термины WOH, STR, GM, маржа, конверсия, ROI, тренд.
Говори человеческим языком: что делать, когда, кому, с каким тоном.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "brands": [
    {
      "brand_id": "string",
      "brand_name": "string",
      "decision_type": "markdown | visibility | reorder",
      "decision_summary": "одно предложение что нужно сделать",
      "urgency": "critical | high | medium | low",
      "key_message": "главный месседж для покупателей (без бизнес-терминов)",
      "overall_tone": "urgency | excitement | calm | informational",
      "channels": {
        "smm": {
          "action_needed": true,
          "brief": "что публиковать, какой контент, какой тон",
          "frequency": "конкретная частота (например: 3-4 раза в день)",
          "content_direction": "Reels, карусели, Stories — что именно",
          "start_date": "YYYY-MM-DD",
          "priority": 1
        },
        "email": {
          "action_needed": true,
          "brief": "что и кому отправить",
          "send_timing": "today | tomorrow | this_week",
          "subject_direction": "направление для темы письма",
          "cta": "призыв к действию",
          "priority": 1
        },
        "ads": {
          "action_needed": true,
          "brief": "что таргетировать и как",
          "budget_recommendation": "конкретная сумма в гривнях",
          "targeting": "описание аудитории",
          "priority": 2
        },
        "store": {
          "action_needed": true,
          "brief": "что физически изменить в магазине",
          "display_changes": "что переставить/повесить",
          "staff_talking_points": "что говорить покупателям",
          "priority": 3
        },
        "marketplace": {
          "action_needed": true,
          "brief": "что сделать на маркетплейсах (Prom.ua, Rozetka, Instagram)",
          "priority_platform": "prom_ua | rozetka | instagram",
          "reason": "почему именно этот",
          "priority": 1
        }
      }
    }
  ],
  "summary": "2-3 предложения общая картина",
  "start_immediately": ["brand_id1", "brand_id2"]
}

ПРАВИЛА ТОНА:
- Уценка / скидка → urgency или excitement
- Видимость без скидки → informational, нельзя обещать скидку
- Дозаказ — это рекомендация закупить, а не подтвержденное поступление: нельзя сообщать покупателям, что товар уже в наличии
- Не придумывай бюджет: он требует отдельного согласования PM`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;

  const context = await resolveAgentRunContext(tenantId, body);
  const [repricingState, reorderingState] = await Promise.all([
    getCurrentDependencyRun(tenantId, "repricing", context),
    getCurrentDependencyRun(tenantId, "reordering", context),
  ]);
  if (!repricingState.ready || !reorderingState.ready) {
    const details = [
      !repricingState.ready ? `Repricing: ${repricingState.reason}` : null,
      !reorderingState.ready ? `Reordering: ${reorderingState.reason}` : null,
    ].filter((item): item is string => Boolean(item));
    return apiError(
      "Спочатку запустіть Repricing і Reordering для поточного імпорту та періоду.",
      409,
      "AGENT_DEPENDENCY_NOT_READY",
      details
    );
  }

  const { run, response: runResponse } = await startAgentRun({
    tenantId,
    agentType: "commercial_marketer",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const repricingRun = repricingState.run;
    const reorderingRun = reorderingState.run;

    const decisions = extractCommercialDecisions(repricingRun?.output, reorderingRun?.output);

    if (decisions.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "done", output: { brands: [], message: "Немає валідованих рекомендацій для створення маркетингових брифів." }, finishedAt: new Date() },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    const analysisDate = (asOf ?? new Date()).toISOString().slice(0, 10);
    const executionDate = new Date().toISOString().slice(0, 10);
    const prompts: string[] = [];
    const rawResponses: string[] = [];
    const parseErrors: string[] = [];
    const batched = await runAgentBatches({
      items: decisions,
      batchSize: 1,
      concurrency: 2,
      runBatch: async (batch) => {
        const decision = batch[0];
        const typeLabel = decision.type === "markdown"
          ? "уцінка/знижка"
          : decision.type === "visibility"
            ? "підвищення видимості без знижки"
            : "рекомендація дозамовлення; надходження ще не підтверджене";
        const userPrompt = `Валідована автоматична рекомендація для маркетингової підготовки:\n\n• ${decision.brand_name} (id: ${decision.brand_id}): ${decision.label} (тип: ${typeLabel})\n\nДата аналізу: ${analysisDate}\nДата можливого старту: ${executionDate}${dateFrom ? `\nПеріод даних: з ${dateFrom.toISOString().slice(0, 10)}` : ""}\nСтвори конкретний маркетинговий бриф для бренду за 5 каналами. Не називай це затвердженим рішенням PM.`;
        prompts.push(userPrompt);
        const raw = await chat({
          systemPrompt: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: 2600,
          providerOverride,
        });
        rawResponses.push(raw);
        const { data: parsed, error } = parseAgentJson<{ brands?: any[] }>(raw, "object");
        if (error) parseErrors.push(error);
        return [normalizeCommercialBrief(decision, executionDate, parsed?.brands?.[0])];
      },
      fallbackBatch: (batch) => batch.map((decision) => buildCommercialFallback(decision, executionDate)),
    });

    const output: Record<string, any> = {
      analysis_date: analysisDate,
      brands: batched.results,
      summary: "Маркетингові брифи сформовано за валідованими рекомендаціями щодо ціни, видимості та поповнення.",
      start_immediately: decisions.filter((decision) => decision.type === "markdown").map((decision) => decision.brand_id),
      ...(batched.errors.length > 0
        ? { message: "Частину брифів сформовано без AI через недоступність провайдера." }
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
      decisionCount: decisions.length,
      executionDate,
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
