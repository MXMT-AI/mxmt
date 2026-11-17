import { getLocale } from "next-intl/server";
import { requireWorkspaceTenantId } from "@/lib/workspace-request";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/translations";
import { loadAnalystClassification } from "@/lib/analyst-classification";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { DashboardSkuPanel } from "../dashboard-sku-panel/dashboard-sku-panel";
import { DashboardSetupCard } from "../dashboard-setup-card/dashboard-setup-card";
import { DashboardSalesPanel } from "../dashboard-sales-panel/dashboard-sales-panel";

export default async function DashboardPage() {
  const tenantId = await requireWorkspaceTenantId();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const since14 = new Date(now.getTime() - 14 * 86400000);
  const since7 = new Date(now.getTime() - 7 * 86400000);

  const [classification, driveSync, catalogItemCount, dailySales, lang] = await Promise.all([
    loadAnalystClassification(tenantId),
    prisma.googleDriveSync.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { lastSyncAt: true, syncStatus: true },
    }),
    prisma.catalogItem.count({ where: { tenantId } }),
    prisma.salesRecord.groupBy({
      by: ["date"],
      where: { tenantId, date: { gte: since30 } },
      _sum: { qtySold: true },
      orderBy: { date: "asc" },
    }),
    getLocale(),
  ]);
  const t = getT(lang);
  const uk = lang === "uk";
  const { skus, summary, businessModel, hasOnboarding, catalogSkuCount } = classification;
  const stockouts = skus.filter((sku) => sku.flag === "stockout").sort((a, b) => a.daysOfStock - b.daysOfStock).slice(0, 4);
  const hits = skus.filter((sku) => sku.flag === "hit").sort((a, b) => b.sold7 - a.sold7).slice(0, 4);
  const alertCount = summary.stockout + summary.hit;
  const totalItems = Math.max(catalogSkuCount, catalogItemCount);
  const sparkData = dailySales.map((sale) => ({
    date: sale.date instanceof Date ? sale.date.toISOString().slice(0, 10) : String(sale.date),
    qty: sale._sum.qtySold ?? 0,
  }));
  let thisWeekTotal = 0;
  let prevWeekTotal = 0;
  let total30 = 0;
  for (const sale of dailySales) {
    const date = new Date(sale.date);
    const qty = sale._sum.qtySold ?? 0;
    total30 += qty;
    if (date >= since7) thisWeekTotal += qty;
    else if (date >= since14) prevWeekTotal += qty;
  }
  const wowPct = prevWeekTotal > 0
    ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100)
    : null;

  const kpis = [
    { label: t.dash_skus, value: totalItems.toString(), color: "var(--cyan-ink)", description: t.dash_in_catalog },
    {
      label: t.dash_alerts,
      value: alertCount > 0 ? alertCount.toString() : t.dash_no_alerts,
      color: alertCount > 0 ? "var(--orange-ink)" : "var(--subtle)",
      description: alertCount > 0 ? t.dash_alerts_sub : "—",
    },
    {
      label: t.dash_model,
      value: hasOnboarding ? businessModel : "—",
      color: "var(--violet-ink)",
      description: hasOnboarding ? t.dash_configured : t.dash_not_set,
    },
    {
      label: t.dash_sync,
      value: driveSync?.lastSyncAt
        ? new Date(driveSync.lastSyncAt).toLocaleDateString(uk ? "uk-UA" : "en-GB")
        : "—",
      color: "var(--amber-ink)",
      description: driveSync?.syncStatus ?? t.dash_no_source,
    },
  ];


  return (
    <div className="max-w-5xl p-8">
      <header className="mb-8">
        <Text variant="body" className="mb-2 font-mono text-[10px] tracking-widest text-(--subtle) uppercase">{t.dash_overview}</Text>
        <Heading as="h1" variant="page" className="mb-1 text-2xl tracking-normal">{t.dash_title}</Heading>
        <Text variant="body" className="leading-5">
          {now.toLocaleDateString(uk ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((metric) => <MetricTile key={metric.label} variant="dashboard" {...metric} />)}
      </dl>
      {sparkData.length >= 3 && <DashboardSalesPanel data={sparkData} total={total30} weekChange={wowPct} uk={uk} />}

      <div className="space-y-4">
        {stockouts.length > 0 && <DashboardSkuPanel items={stockouts} total={summary.stockout} kind="stockout" t={t} uk={uk} />}
        {hits.length > 0 && <DashboardSkuPanel items={hits} total={summary.hit} kind="hit" t={t} uk={uk} />}
        {!hasOnboarding && (
          <DashboardSetupCard eyebrow={t.dash_s1_label} title={t.dash_s1_title} href="/settings" action={t.dash_s1_btn} tone="warning">
            {t.dash_s1_desc}
          </DashboardSetupCard>
        )}
        {totalItems === 0 && (
          <DashboardSetupCard eyebrow={t.dash_s2_label} title={t.dash_s2_title} href="/assortment" action={t.dash_s2_btn} tone="accent">
            {t.dash_s2_desc}
          </DashboardSetupCard>
        )}
        {hasOnboarding && totalItems > 0 && alertCount === 0 && sparkData.length < 3 && (
          <DashboardSetupCard eyebrow={t.dash_ready_label} title={t.dash_ready_title} href="/analyst" action={t.dash_ready_btn} tone="positive" stacked>
            {totalItems} {t.dash_ready_loaded} · {businessModel} {t.dash_ready_model} {t.dash_ready_active}
          </DashboardSetupCard>
        )}
      </div>
    </div>
  );
}
