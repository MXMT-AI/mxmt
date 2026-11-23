import { isoWeek } from "@/lib/iso-week";
import { NextResponse } from "next/server";
import type { SkuFlag } from "@/lib/analyst-types";
import { loadAnalystClassificationRows } from "@/lib/analyst-classification";
import { requireApiUser } from "@/lib/server-auth";
import { formatMessage } from "@/i18n/format-message";
import { apiCalendarInsightsRouteMessages as ukrainianCopy } from "@/messages/uk.json";

export interface CalendarInsight {
  type: "warn" | "agent" | "stock";
  brand: string;
  week: string;
  title: string;
  desc: string;
  impact: string;
  weekKey?: string;
  rowKey?: string;
}


export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const { skus: classified, catalogSkuCount } = await loadAnalystClassificationRows(tenantId);
  if (catalogSkuCount === 0) return NextResponse.json([]);

  const brandMap = new Map<string, (typeof classified)[number]>();
  for (const row of classified) {
    const key = row.brand ?? row.name;
    const existing = brandMap.get(key);
    const flagPrio: Record<SkuFlag, number> = { stockout: 0, hit: 1, slow: 2, dead: 3, ok: 4 };
    if (!existing || flagPrio[row.flag] < flagPrio[existing.flag]) {
      brandMap.set(key, row);
    }
  }

  const insights: CalendarInsight[] = [];
  const baseWeek = isoWeek(new Date(), "local").week;

  const stockouts = [...brandMap.values()]
    .filter((r) => r.flag === "stockout")
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 3);

  for (const r of stockouts) {
    const brand = r.brand ?? r.name;
    const weeksLeft = Math.ceil(r.daysOfStock / 7);
    const targetWeek = baseWeek + Math.max(0, weeksLeft - 1);
    insights.push({
      type: "warn",
      brand,
      week: weeksLeft <= 1 ? ukrainianCopy.weekЦейТиждень : formatMessage(ukrainianCopy.weekТижні, { weeksLeft }),
      title: formatMessage(ukrainianCopy.titleЛишеДнівЗалишку, { brand, daysOfStock: r.daysOfStock }),
      desc: formatMessage(ukrainianCopy.descПриПоточнихПродажахШтДеньТовар, { avgDaily30: r.avgDaily30, daysOfStock: r.daysOfStock }),
      impact: formatMessage(ukrainianCopy.impactРизикВтратаПродажівШт, { value1: Math.round(r.avgDaily30 * 14) }),
      weekKey: `w${targetWeek}`,
      rowKey: "supply",
    });
  }

  const hits = [...brandMap.values()]
    .filter((r) => r.flag === "hit")
    .sort((a, b) => b.sold7 - a.sold7)
    .slice(0, 3);

  for (const r of hits) {
    const brand = r.brand ?? r.name;
    const growth = r.sold30 > 0 ? Math.round(((r.sold7 / 7) / (r.sold30 / 30) - 1) * 100) : 0;
    insights.push({
      type: "agent",
      brand,
      week: ukrainianCopy.weekЗараз,
      title: formatMessage(ukrainianCopy.titleРостеЗаТиждень, { brand, growth }),
      desc: formatMessage(ukrainianCopy.descПродажіЗа7ДнівШт, { sold7: r.sold7, growth, daysOfStock: r.daysOfStock }),
      impact: formatMessage(ukrainianCopy.impactРекомендаціяЗбільшAdsБюджетНа, { brand }),
      weekKey: `w${baseWeek}`,
      rowKey: "accent",
    });
  }

  const dead = [...brandMap.values()]
    .filter((r) => r.flag === "dead" && r.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 2);

  for (const r of dead) {
    const brand = r.brand ?? r.name;
    insights.push({
      type: "stock",
      brand,
      week: ukrainianCopy.weekНевідкладно,
      title: formatMessage(ukrainianCopy.titleШтЗамороженоБезПродажів, { brand, stock: r.stock }),
      desc: ukrainianCopy.descЗаОстанні30Днів,
      impact: ukrainianCopy.impactFlashSale2030ЗвільнитьКапіталТа,
      weekKey: `w${baseWeek}`,
      rowKey: "promo",
    });
  }

  return NextResponse.json(insights);
}
