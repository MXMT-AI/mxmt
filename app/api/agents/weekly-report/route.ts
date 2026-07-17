import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { serverError } from "@/lib/api-contracts";

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const SYSTEM_PROMPT = `Ты PM-ассистент в fashion retail. Пишешь еженедельный отчёт для двух аудиторий.

Получаешь сводки от всех AI-агентов за текущую неделю.
Создаёшь лаконичный двухуровневый отчёт: для PM и для маркетинга.

Верни строго JSON без преамбулы:

{
  "report_date": "YYYY-MM-DD",
  "week": "YYYY-W##",
  "pm_brief": "3-4 предложения для PM: ключевые факты, что решено, что требует решения. Без терминов ИИ.",
  "marketing_brief": "3-4 предложения для маркетинга: что делать на этой неделе, какой тон, какие бренды в фокусе.",
  "top_priorities": [
    {
      "rank": 1,
      "type": "repricing | reordering | campaign | inventory | marketing",
      "brand": "название бренда или 'все'",
      "action": "конкретное действие одним предложением",
      "deadline": "today | tomorrow | this_week | next_week"
    }
  ],
  "inventory_health": {
    "critical_brands": 2,
    "warning_brands": 3,
    "ok_brands": 5,
    "total_brands": 10
  },
  "decisions_needed": [
    "конкретное решение, которое должен принять PM (не маркетинг)"
  ],
  "wins": [
    "что хорошего произошло или идёт хорошо на этой неделе"
  ],
  "next_week_focus": "одно предложение: на чём сосредоточиться на следующей неделе",
  "summary": "одно предложение: общее состояние бизнеса этой недели"
}

ПРАВИЛА:
- top_priorities максимум 5 пунктов, только самые срочные
- decisions_needed — только то, что решает PM (бюджет, скидки, дозаказ)
- wins — найди позитив, даже если ситуация тяжёлая
- Пиши по-человечески, без аббревиатур WOH/STR/GM/ROI
- Если данных мало — честно напиши что неделя только началась`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;

  const run = await prisma.agentRun.create({
    data: { tenantId, agentType: "weekly_report", status: "running", input: { provider: providerOverride ?? "anthropic", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null } },
  });

  try {
    const now = new Date();
    const currentWeek = isoWeekNumber(now);
    const year = now.getFullYear();

    // Fetch all latest done runs
    const agentTypes = ["inventory_analyst", "channel_analytics", "product_attributes", "repricing", "reordering", "commercial_marketer", "calendar_agent", "campaign_analysis"];
    const latestRuns = await Promise.all(
      agentTypes.map((agentType) =>
        prisma.agentRun.findFirst({ where: { tenantId, agentType, status: "done" }, orderBy: { startedAt: "desc" } })
      )
    );
    const runMap = Object.fromEntries(agentTypes.map((t, i) => [t, latestRuns[i]]));

    // Build text summary per agent
    const sections: string[] = [];

    // Inventory Analyst
    const invRun = runMap["inventory_analyst"];
    if (invRun?.output) {
      const out = invRun.output as any;
      const brands: any[] = out.brands ?? [];
      const critical = brands.filter((b: any) => b.status === "critical").length;
      const warning = brands.filter((b: any) => b.status === "warning").length;
      const criticalNames = brands.filter((b: any) => b.status === "critical").map((b: any) => b.brand_name).join(", ");
      sections.push(`ИНВЕНТАРЬ (${brands.length} брендов):
Критических: ${critical}${criticalNames ? ` (${criticalNames})` : ""}, Предупреждений: ${warning}, В норме: ${brands.length - critical - warning}
Резюме: ${out.summary ?? "—"}`);
    }

    // Channel Analytics
    const chRun = runMap["channel_analytics"];
    if (chRun?.output) {
      const out = chRun.output as any;
      const channels: any[] = out.channels ?? [];
      const best = channels.find((c: any) => c.status === "best")?.channel ?? "—";
      const weak = channels.filter((c: any) => c.status === "weak" || c.status === "inactive").map((c: any) => c.channel).join(", ");
      sections.push(`КАНАЛЫ: Лучший — ${best}, Слабые — ${weak || "нет"}
Резюме: ${out.summary ?? "—"}`);
    }

    // Product Attributes
    const prodRun = runMap["product_attributes"];
    if (prodRun?.output) {
      const out = prodRun.output as any;
      const bestsellers: string[] = out.bestsellers ?? [];
      const deadStock: string[] = out.dead_stock ?? [];
      sections.push(`АССОРТИМЕНТ: Бестселлеры — ${bestsellers.slice(0, 3).join(", ") || "—"}, Dead stock — ${deadStock.slice(0, 3).join(", ") || "—"}
Резюме: ${out.summary ?? "—"}`);
    }

    // Repricing
    const repRun = runMap["repricing"];
    if (repRun?.output) {
      const out = repRun.output as any;
      const brands: any[] = out.brands ?? [];
      const recommended = brands.filter((b: any) => (b.options ?? []).some((o: any) => o.evaluation?.recommended)).map((b: any) => b.brand_name).join(", ");
      sections.push(`УЦЕНКА: ${brands.length} брендов требуют уценки${recommended ? ` (рекомендовано: ${recommended})` : ""}`);
    }

    // Reordering
    const reRun = runMap["reordering"];
    if (reRun?.output) {
      const out = reRun.output as any;
      const brands: any[] = out.brands ?? [];
      const recommended = brands.filter((b: any) => (b.scenarios ?? []).some((s: any) => s.evaluation?.recommended)).map((b: any) => b.brand_name).join(", ");
      sections.push(`ДОЗАКАЗ: ${brands.length} брендов с риском нехватки${recommended ? ` (рекомендовано: ${recommended})` : ""}`);
    }

    // Commercial Marketer
    const mktRun = runMap["commercial_marketer"];
    if (mktRun?.output) {
      const out = mktRun.output as any;
      const brands: any[] = out.brands ?? [];
      const urgent = brands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").map((b: any) => b.brand_name).join(", ");
      sections.push(`МАРКЕТИНГ: ${brands.length} брифов создано${urgent ? `, срочные — ${urgent}` : ""}
Резюме: ${out.summary ?? "—"}`);
    }

    // Calendar Agent
    const calRun = runMap["calendar_agent"];
    if (calRun?.output) {
      const out = calRun.output as any;
      const hs = out.health_score ?? {};
      const criticalGaps = hs.critical_gaps ?? 0;
      sections.push(`КАЛЕНДАРЬ: Coverage ${hs.coverage_percent ?? 0}%, Критических пробелов: ${criticalGaps}
Резюме: ${out.summary ?? hs.summary ?? "—"}`);
    }

    // Campaign Analysis
    const campRun = runMap["campaign_analysis"];
    if (campRun?.output) {
      const out = campRun.output as any;
      const campaigns: any[] = out.campaigns ?? [];
      const behind = campaigns.filter((c: any) => c.status === "behind" || c.status === "stalled").length;
      sections.push(`КАМПАНИИ: ${campaigns.length} активных, ${behind} отстают
Здоровье: ${out.overall_health ?? "—"}, Резюме: ${out.summary ?? "—"}`);
    }

    if (sections.length === 0) {
      const output = {
        report_date: now.toISOString().slice(0, 10),
        week: `${year}-W${currentWeek.toString().padStart(2, "0")}`,
        pm_brief: "Данных пока нет. Запустите агентов Блоков 1-3 для получения полного отчёта.",
        marketing_brief: "Запустите Inventory Analyst, Channel Analytics и Commercial Marketer для создания маркетингового брифа.",
        top_priorities: [],
        inventory_health: { critical_brands: 0, warning_brands: 0, ok_brands: 0, total_brands: 0 },
        decisions_needed: ["Запустить агентов Блока 1 для получения базовых данных"],
        wins: [],
        next_week_focus: "Настроить пайплайн AI-агентов",
        summary: "Данных для отчёта недостаточно.",
        message: "Запустите агентов Блоков 1-3 для генерации отчёта.",
      };
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
      return NextResponse.json({ runId: run.id, ...output });
    }

    const userPrompt = `Данные от AI-агентов за неделю ${year}-W${currentWeek.toString().padStart(2, "0")} (сегодня: ${now.toISOString().slice(0, 10)}):

${sections.join("\n\n")}

Создай еженедельный отчёт для PM и маркетинга.`;

    const raw = await chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      providerOverride,
    });

    let parsed: any = null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { parsed = null; }

    const output = parsed ?? {
      report_date: now.toISOString().slice(0, 10),
      week: `${year}-W${currentWeek.toString().padStart(2, "0")}`,
      pm_brief: "Отчёт временно недоступен.",
      marketing_brief: "Отчёт временно недоступен.",
      top_priorities: [],
      inventory_health: { critical_brands: 0, warning_brands: 0, ok_brands: 0, total_brands: 0 },
      decisions_needed: [],
      wins: [],
      next_week_focus: "—",
      summary: "Отчёт временно недоступен.",
    };

    output.agentsIncluded = agentTypes.filter((t) => runMap[t] != null).length;
    output._debug = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      rawResponse: raw,
      provider: providerOverride ?? "anthropic",
      model: (providerOverride ?? "anthropic") === "openai" ? "gpt-4o" : "claude-sonnet-4-6",
      parsedSuccessfully: parsed !== null,
      agentsIncluded: output.agentsIncluded,
      agentSections: sections.length,
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
