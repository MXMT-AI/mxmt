import {salesMetricRow} from "./sales-metrics";
import { Prisma } from "@prisma/client";
import type { ArticleReportRow } from "@/lib/article-report";

export type ReportGroupDimension = "brand" | "category";

export interface GroupedReportRow {
  groupKey: string;
  groupValue: string | null;
  salesUah: Prisma.Decimal;
  salesUnits: Prisma.Decimal;
  costOfSalesUah: Prisma.Decimal;
  gpUah: Prisma.Decimal;
  stockUnits: Prisma.Decimal;
  stockUah: Prisma.Decimal;
  strPct: Prisma.Decimal | null;
  salesSharePct: Prisma.Decimal | null;
  avgSalesLastTwoWeeks: Prisma.Decimal;
  woh: Prisma.Decimal | null;
}

interface GroupTotals {
  groupKey: string;
  groupValue: string | null;
  salesUah: Prisma.Decimal;
  salesUnits: Prisma.Decimal;
  costOfSalesUah: Prisma.Decimal;
  gpUah: Prisma.Decimal;
  stockUnits: Prisma.Decimal;
  stockUah: Prisma.Decimal;
  avgSalesLastTwoWeeks: Prisma.Decimal;
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function divide(numerator: Prisma.Decimal, denominator: Prisma.Decimal): Prisma.Decimal | null {
  return denominator.isZero() ? null : numerator.div(denominator);
}

function stableGroupKey(dimension: ReportGroupDimension, value: string | null): string {
  return value === null ? `${dimension}:null` : `${dimension}:value:${value}`;
}

function emptyGroup(dimension: ReportGroupDimension, value: string | null): GroupTotals {
  return {
    groupKey: stableGroupKey(dimension, value),
    groupValue: value,
    salesUah: zero(),
    salesUnits: zero(),
    costOfSalesUah: zero(),
    gpUah: zero(),
    stockUnits: zero(),
    stockUah: zero(),
    avgSalesLastTwoWeeks: zero(),
  };
}

export function calculateGroupedReportRows(
  articleRows: ArticleReportRow[],
  dimension: ReportGroupDimension
): GroupedReportRow[] {
  const groups = new Map<string, GroupTotals>();
  for (const row of articleRows) {
    const groupValue = dimension === "brand" ? row.brand : row.category;
    const groupKey = stableGroupKey(dimension, groupValue);
    const group = groups.get(groupKey) ?? emptyGroup(dimension, groupValue);
    group.salesUah = group.salesUah.add(row.salesUah);
    group.salesUnits = group.salesUnits.add(row.salesUnits);
    group.costOfSalesUah = group.costOfSalesUah.add(row.costOfSalesUah);
    group.gpUah = group.gpUah.add(row.gpUah);
    group.stockUnits = group.stockUnits.add(row.stockUnits);
    group.stockUah = group.stockUah.add(row.stockUah);
    group.avgSalesLastTwoWeeks = group.avgSalesLastTwoWeeks.add(row.avgSalesLastTwoWeeks);
    groups.set(groupKey, group);
  }

  const totalSales = [...groups.values()].reduce(
    (total, group) => total.add(group.salesUah),
    zero()
  );
  return [...groups.values()]
    .sort((left, right) => {
      if (left.groupValue === null) return right.groupValue === null ? 0 : 1;
      if (right.groupValue === null) return -1;
      return left.groupValue.localeCompare(right.groupValue, "uk-UA");
    })
    .map((group) => ({
      ...group,
      strPct: divide(group.salesUnits, group.salesUnits.add(group.stockUnits)),
      salesSharePct: divide(group.salesUah, totalSales),
      woh: divide(group.stockUnits, group.avgSalesLastTwoWeeks),
    }));
}

export type SalesGroupDimension='sku'|'brand'|'category'|'channel';
/** Financial views group the same eligible facts, never averages of rounded row margins. */
export function calculateSalesGroupedRows(facts:import('./sales-metrics').SalesFact[],dimension:SalesGroupDimension,context:import('./sales-metrics').SalesMetricContext){
 const groups=new Map<string,{id:string;name:string;currency:string|null;facts:import('./sales-metrics').SalesFact[]}>();
 for(const f of facts){
  const id=dimension==='sku'?f.skuId??`unmatched:${f.sourceId}:${f.sku??f.id}`:dimension==='brand'?f.brandId??'unbranded':dimension==='category'?f.categoryId??'uncategorized':`${f.sourceId}:${f.channelId??'unknown'}`;
  const name=dimension==='sku'?`${f.sku??'Unmatched'} · ${f.name??''}`:dimension==='brand'?f.brand??'Unbranded':dimension==='category'?f.category??'Uncategorized':f.channel??f.channelId??'Unknown channel';
  const key=JSON.stringify([id,f.currency]);const group=groups.get(key)??{id,name,currency:f.currency,facts:[]};group.facts.push(f);groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:(a.currency??'').localeCompare(b.currency??'')).map(g=>salesMetricRow(g.id,g.name,g.currency,g.facts,context));
}
