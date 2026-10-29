import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/translations";
import Link from "next/link";
import type { SkuFlag } from "@/lib/analyst-types";
import { LEGACY_CLASSIFICATION_FILTER, classify, getThresholds } from "@/lib/classify";
import SalesSparkline from "@/components/dashboard/SalesSparkline";

export default async function DashboardPage() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value ?? "uk") as "uk" | "en";
  const t = getT(lang);
  const uk = lang === "uk";

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [skus, snapshots, sales30raw, sales7raw, onboarding, driveSync, catalogItemCount, dailySales] = await Promise.all([
    prisma.sku.findMany({
      where: { tenantId, ...LEGACY_CLASSIFICATION_FILTER, status: { in: ["ACTIVE", "NEW"] } },
      include: { brand: { select: { name: true, leadTimeDays: true } } },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId, sourceId: null },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { skuId: true, qtyOnHand: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since30 } },
      _sum: { qtySold: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since7 } },
      _sum: { qtySold: true },
    }),
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
    prisma.googleDriveSync.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.catalogItem.count({ where: { tenantId } }),
    prisma.salesRecord.groupBy({
      by: ["date"],
      where: { tenantId, date: { gte: since30 } },
      _sum: { qtySold: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const thresholds = getThresholds(onboarding?.businessModel ?? null);
  const stockMap = Object.fromEntries(snapshots.map((s) => [s.skuId, s.qtyOnHand]));
  const s30Map = Object.fromEntries(sales30raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));
  const s7Map = Object.fromEntries(sales7raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));

  type SkuRow = {
    id: string; sku: string; name: string; brand: string | null;
    stock: number; sold7: number; sold30: number;
    avgDaily30: number; daysOfStock: number; flag: SkuFlag;
  };

  const classified: SkuRow[] = skus.map((s) => {
    const stock = stockMap[s.id] ?? 0;
    const sold30 = s30Map[s.id] ?? 0;
    const sold7 = s7Map[s.id] ?? 0;
    const leadTime = s.brand?.leadTimeDays ?? 14;
    const avg30 = sold30 / 30;
    const days = avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0;
    return {
      id: s.id, sku: s.sku, name: s.name, brand: s.brand?.name ?? null,
      stock, sold7, sold30, avgDaily30: Math.round(avg30 * 10) / 10,
      daysOfStock: days, flag: classify(stock, sold7, sold30, leadTime, thresholds),
    };
  });

  const stockouts = classified.filter((s) => s.flag === "stockout").sort((a, b) => a.daysOfStock - b.daysOfStock).slice(0, 4);
  const hits = classified.filter((s) => s.flag === "hit").sort((a, b) => b.sold7 - a.sold7).slice(0, 4);
  const alertCount = stockouts.length + hits.length;
  const totalStockouts = classified.filter((s) => s.flag === "stockout").length;
  const totalHits = classified.filter((s) => s.flag === "hit").length;
  const totalItems = Math.max(skus.length, catalogItemCount);

  // Sales trend data for sparkline
  const sparkData = dailySales.map((d) => ({
    date: d.date instanceof Date ? d.date.toISOString().slice(0, 10) : String(d.date),
    qty: d._sum.qtySold ?? 0,
  }));

  // Week-over-week comparison
  const thisWeekTotal = dailySales
    .filter((d) => new Date(d.date) >= since7)
    .reduce((sum, d) => sum + (d._sum.qtySold ?? 0), 0);
  const prevWeekTotal = dailySales
    .filter((d) => new Date(d.date) >= since14 && new Date(d.date) < since7)
    .reduce((sum, d) => sum + (d._sum.qtySold ?? 0), 0);
  const wowPct = prevWeekTotal > 0
    ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100)
    : null;
  const total30 = dailySales.reduce((sum, d) => sum + (d._sum.qtySold ?? 0), 0);

  const kpis = [
    { label: t.dash_skus, value: totalItems.toString(), color: "#00e5c4", sub: t.dash_in_catalog },
    {
      label: t.dash_alerts,
      value: alertCount > 0 ? alertCount.toString() : t.dash_no_alerts,
      color: alertCount > 0 ? "#ff6b35" : "var(--subtle)",
      sub: alertCount > 0 ? t.dash_alerts_sub : "—",
    },
    {
      label: t.dash_model,
      value: onboarding ? onboarding.businessModel : "—",
      color: "#a78bfa",
      sub: onboarding ? t.dash_configured : t.dash_not_set,
    },
    {
      label: t.dash_sync,
      value: driveSync?.lastSyncAt
        ? new Date(driveSync.lastSyncAt).toLocaleDateString(uk ? "uk-UA" : "en-GB")
        : "—",
      color: "#fbbf24",
      sub: driveSync?.syncStatus ?? t.dash_no_source,
    },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <div className="text-[10px] font-mono uppercase tracking-widest text-(--subtle) mb-2">{t.dash_overview}</div>
        <h1 className="text-2xl font-bold text-white mb-1">{t.dash_title}</h1>
        <p className="text-(--muted) text-sm">
          {new Date().toLocaleDateString(uk ? "uk-UA" : "en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(({ label, value, color, sub }) => (
          <div key={label} className="bg-(--surface) border border-(--border) rounded-xl p-5">
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">{label}</div>
            <div className="text-2xl font-bold mb-1 font-mono" style={{ color }}>{value}</div>
            <div className="text-[11px] text-(--muted)">{sub}</div>
          </div>
        ))}
      </div>

      {/* Sales trend chart */}
      {sparkData.length >= 3 && (
        <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-1">
                {uk ? "Продажі — 30 днів" : "Sales — 30 days"}
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-xl font-bold font-mono text-white">{total30}</span>
                <span className="text-[11px] text-(--muted)">{uk ? "одиниць" : "units"}</span>
                {wowPct !== null && (
                  <span className={`text-xs font-mono font-semibold ${wowPct >= 0 ? "text-[#86efac]" : "text-[#fca5a5]"}`}>
                    {wowPct >= 0 ? "+" : ""}{wowPct}% {uk ? "vs минулий тиждень" : "vs last week"}
                  </span>
                )}
              </div>
            </div>
            <Link href="/analyst" className="text-[11px] text-(--muted) hover:text-(--text) transition-colors font-mono">
              {uk ? "Детально →" : "Details →"}
            </Link>
          </div>
          <SalesSparkline data={sparkData} />
        </div>
      )}

      <div className="space-y-4">
        {/* Critical stockouts */}
        {stockouts.length > 0 && (
          <div className="bg-(--surface) border border-accent-orange/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-accent-orange mb-1">{t.dash_critical_label}</div>
                <p className="text-white font-semibold">{t.dash_top_stockouts}</p>
              </div>
              {totalStockouts > 4 && (
                <Link href="/analyst" className="text-xs text-accent-orange hover:text-[#ff8855] transition-colors font-mono">
                  {t.dash_all_stockouts}
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {stockouts.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-(--row) rounded-lg px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-white text-sm font-medium truncate block">{s.name}</span>
                    <span className="text-(--subtle) text-[11px] font-mono">{s.sku}{s.brand ? ` · ${s.brand}` : ""}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <div className="text-accent-orange font-mono font-bold text-sm">{s.daysOfStock}</div>
                      <div className="text-(--subtle) text-[10px]">{t.dash_days_left}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-(--muted) font-mono text-sm">{s.sold7}</div>
                      <div className="text-(--subtle) text-[10px]">{t.dash_sold_7d}</div>
                    </div>
                    <Link
                      href="/assortment"
                      className="text-[11px] px-2.5 py-1 bg-accent-orange/10 border border-accent-orange/20 text-accent-orange rounded-lg hover:bg-accent-orange/20 transition-colors whitespace-nowrap"
                    >
                      {uk ? "Замовити" : "Order"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-(--border-faint)">
              <Link href="/analyst" className="text-[11px] text-accent-orange hover:text-[#ff8855] transition-colors">
                {t.dash_view_analyst}
              </Link>
            </div>
          </div>
        )}

        {/* Top hits */}
        {hits.length > 0 && (
          <div className="bg-(--surface) border border-accent-cyan/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-1">{t.dash_opportunity_label}</div>
                <p className="text-white font-semibold">{t.dash_top_hits}</p>
              </div>
              {totalHits > 4 && (
                <Link href="/analyst" className="text-xs text-accent-cyan hover:text-[#33eecc] transition-colors font-mono">
                  {t.dash_all_hits}
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {hits.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-(--row) rounded-lg px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-white text-sm font-medium truncate block">{s.name}</span>
                    <span className="text-(--subtle) text-[11px] font-mono">{s.sku}{s.brand ? ` · ${s.brand}` : ""}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <div className="text-accent-cyan font-mono font-bold text-sm">{s.sold7}</div>
                      <div className="text-(--subtle) text-[10px]">{t.dash_sold_7d}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-(--muted) font-mono text-sm">{s.avgDaily30}</div>
                      <div className="text-(--subtle) text-[10px]">{t.dash_avg_daily}</div>
                    </div>
                    <Link
                      href="/calendar"
                      className="text-[11px] px-2.5 py-1 bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan rounded-lg hover:bg-accent-cyan/20 transition-colors whitespace-nowrap"
                    >
                      {uk ? "Календар" : "Calendar"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-(--border-faint)">
              <Link href="/analyst" className="text-[11px] text-accent-cyan hover:text-[#33eecc] transition-colors">
                {t.dash_view_analyst}
              </Link>
            </div>
          </div>
        )}

        {/* Setup prompts */}
        {!onboarding && (
          <div className="bg-(--surface) border border-accent-yellow/20 rounded-xl p-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-2">{t.dash_s1_label}</div>
              <p className="text-white font-semibold mb-1">{t.dash_s1_title}</p>
              <p className="text-(--muted) text-sm">{t.dash_s1_desc}</p>
            </div>
            <Link href="/settings" className="shrink-0 px-4 py-2 bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow rounded-lg text-sm font-medium hover:bg-accent-yellow/20 transition-colors whitespace-nowrap">
              {t.dash_s1_btn}
            </Link>
          </div>
        )}

        {catalogItemCount === 0 && skus.length === 0 && (
          <div className="bg-(--surface) border border-accent-purple/20 rounded-xl p-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-purple mb-2">{t.dash_s2_label}</div>
              <p className="text-white font-semibold mb-1">{t.dash_s2_title}</p>
              <p className="text-(--muted) text-sm">{t.dash_s2_desc}</p>
            </div>
            <Link href="/assortment" className="shrink-0 px-4 py-2 bg-accent-purple/10 border border-accent-purple/20 text-accent-purple rounded-lg text-sm font-medium hover:bg-accent-purple/20 transition-colors whitespace-nowrap">
              {t.dash_s2_btn}
            </Link>
          </div>
        )}

        {onboarding && totalItems > 0 && alertCount === 0 && sparkData.length < 3 && (
          <div className="bg-(--surface) border border-accent-cyan/20 rounded-xl p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-2">{t.dash_ready_label}</div>
            <p className="text-white font-semibold mb-1">{t.dash_ready_title}</p>
            <p className="text-(--muted) text-sm mb-4">
              {totalItems} {t.dash_ready_loaded} · {onboarding.businessModel} {t.dash_ready_model} {t.dash_ready_active}
            </p>
            <Link href="/analyst" className="inline-flex px-4 py-2 bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan rounded-lg text-sm font-medium hover:bg-accent-cyan/20 transition-colors">
              {t.dash_ready_btn}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
