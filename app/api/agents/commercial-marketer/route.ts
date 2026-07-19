import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";
import { parseAgentJson } from "@/lib/agent-output";

const SYSTEM_PROMPT = `Ты коммерческий маркетолог в fashion retail.

Ты получаешь список брендов с решениями по уценке или дозаказу и создаёшь конкретные задачи для каждого маркетингового канала.

КРИТИЧЕСКИ ВАЖНО: НЕ используй термины WOH, STR, GM, маржа, конверсия, ROI, тренд.
Говори человеческим языком: что делать, когда, кому, с каким тоном.

Верни строго JSON без преамбулы:

{
  "analysis_date": "YYYY-MM-DD",
  "brands": [
    {
      "brand_id": "string",
      "brand_name": "string",
      "decision_type": "markdown | reorder",
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
- Дозаказ (товар снова есть) → calm + positive
- Если urgency="critical" → SMM и email в приоритете, start_date = сегодня`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const dateFrom: Date | undefined = body.dateFrom ? new Date(body.dateFrom) : undefined;

  const run = await prisma.agentRun.create({
    data: { tenantId, agentType: "commercial_marketer", status: "running", input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null } },
  });

  try {
    // Get recommended actions from latest repricing and reordering runs
    const [repricingRun, reorderingRun] = await Promise.all([
      prisma.agentRun.findFirst({ where: { tenantId, agentType: "repricing", status: "done" }, orderBy: { startedAt: "desc" } }),
      prisma.agentRun.findFirst({ where: { tenantId, agentType: "reordering", status: "done" }, orderBy: { startedAt: "desc" } }),
    ]);

    const decisions: { brand_id: string; brand_name: string; type: "markdown" | "reorder"; action: string; label: string }[] = [];

    // Extract recommended repricing options
    if (repricingRun?.output) {
      const out = repricingRun.output as any;
      for (const brand of out.brands ?? []) {
        const recommended = (brand.options ?? []).find((o: any) => o.evaluation?.recommended);
        if (recommended) {
          decisions.push({
            brand_id: brand.brand_id,
            brand_name: brand.brand_name,
            type: "markdown",
            action: recommended.action ?? "FLASH_SALE",
            label: recommended.label ?? `Скидка ${recommended.discount_percent}%`,
          });
        }
      }
    }

    // Extract recommended reordering scenarios
    if (reorderingRun?.output) {
      const out = reorderingRun.output as any;
      for (const brand of out.brands ?? []) {
        // Skip if already added from repricing
        if (decisions.some((d) => d.brand_id === brand.brand_id)) continue;
        const recommended = (brand.scenarios ?? []).find((s: any) => s.evaluation?.recommended);
        if (recommended) {
          decisions.push({
            brand_id: brand.brand_id,
            brand_name: brand.brand_name,
            type: "reorder",
            action: "REORDER",
            label: recommended.label ?? "Дозаказ",
          });
        }
      }
    }

    // If no repricing/reordering data — fall back to high-WOH brands
    if (decisions.length === 0) {
      const brandMetrics = await getBrandMetrics(tenantId, asOf, dateFrom);
      const highWoh = brandMetrics.filter((b) => b.wohDays > 45 && b.skuCount > 0).slice(0, 5);
      for (const b of highWoh) {
        decisions.push({ brand_id: b.brandId, brand_name: b.brandName, type: "markdown", action: "MARKDOWN", label: "Уценка (рекомендовано)" });
      }
    }

    if (decisions.length === 0) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "done", output: { brands: [], message: "Нет решений для создания брифов. Сначала запустите Repricing или Reordering." }, finishedAt: new Date() },
      });
      return NextResponse.json({ runId: run.id, brands: [] });
    }

    const userPrompt = `Решения PM для маркетинговой активации:

${decisions.map((d) => `• ${d.brand_name} (id: ${d.brand_id}): ${d.label} (тип: ${d.type === "markdown" ? "уценка/скидка" : "дозаказ — товар снова в наличии"})`).join("\n")}

Дата анализа: ${(asOf ?? new Date()).toISOString().slice(0, 10)}${dateFrom ? `\nПериод данных: с ${dateFrom.toISOString().slice(0, 10)} (скорость продаж и WOH рассчитаны за этот период; тренд = вторая половина периода vs первая)` : ""}
Создай конкретные маркетинговые брифы для каждого бренда по 5 каналам.`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 5000,
      providerOverride,
    });

    const { data: parsed, error: parseError } = parseAgentJson<any>(raw, "object");

    const output = parsed ?? {
      analysis_date: new Date().toISOString().slice(0, 10),
      brands: decisions.map((d) => ({
        brand_id: d.brand_id,
        brand_name: d.brand_name,
        decision_summary: d.label,
        urgency: "high",
        channels: {},
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
      decisionCount: decisions.length,
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
