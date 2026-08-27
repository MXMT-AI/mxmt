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
