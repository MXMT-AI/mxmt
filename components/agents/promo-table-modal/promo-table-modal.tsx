"use client";

import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { PromoSimulation, PromoSkuRow } from "@/lib/promo-calc";
import { buildPromoSheetValues } from "@/lib/promo-sheet";
import { ExcelExportButton } from "@/components/agents/excel-export-button/excel-export-button";

import { SimulationDialog } from "../simulation-dialog/simulation-dialog";
import { SimulationTable, type SimulationColumn } from "../simulation-table/simulation-table";
import { useAgentSimulation } from "../use-agent-simulation";
import { formatMessage } from "@/i18n/format-message";
import { agentsPromoTableModalMessages as ukrainianCopy } from "@/messages/uk.json";

export interface PromoSimParams {
  brandId: string;
  brandName: string;
  strategyType: string;
  label: string;
  discountPercent: number;
  durationDays: number;
  unitsToSellPercent?: number | null;
  asOf?: string | null;
  dateFrom?: string | null;
}

const amountFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const fmtUah = (value: number) => amountFormatter.format(value);
const formatPercent = (value: number | null) => value != null ? `${value}%` : "—";

const promoColumns: SimulationColumn<PromoSkuRow>[] = [
  { label: "SKU", render: (row) => row.sku, className: "text-(--text)" },
  { label: ukrainianCopy.labelНазва, render: (row) => row.name, title: (row) => row.name, className: "max-w-[180px] truncate" },
  { label: ukrainianCopy.labelЗалишок, render: (row) => row.stock },
  { label: ukrainianCopy.labelЦіна, render: (row) => fmtUah(row.priceRetail) },
  { label: ukrainianCopy.labelЗіЗнижкою, render: (row) => fmtUah(row.newPrice), className: "text-accent-purple" },
  { label: ukrainianCopy.labelМаржаДо, render: (row) => formatPercent(row.marginBeforePct) },
  {
    label: ukrainianCopy.labelМаржаПісля,
    render: (row) => formatPercent(row.marginAfterPct),
    className: ({ marginAfterPct }) => {
      if (marginAfterPct == null) return "";
      if (marginAfterPct < 0) return "text-accent-danger";
      return marginAfterPct < 15 ? "text-accent-yellow" : "";
    },
  },
  { label: ukrainianCopy.labelПрогнозШт, render: (row) => row.promoUnits, className: "text-(--text)" },
  { label: ukrainianCopy.labelВиручка, render: (row) => fmtUah(row.promoRevenue) },
  {
    label: ukrainianCopy.labelМаржаГрн,
    render: (row) => fmtUah(row.promoMarginUah),
    className: (row) => row.promoMarginUah < 0 ? "text-accent-danger" : "",
  },
  { label: ukrainianCopy.labelКапітал, render: (row) => fmtUah(row.capitalReleased), className: "text-accent-cyan" },
  { label: ukrainianCopy.labelDOHПісля, render: (row) => row.wohAfterDays != null ? formatMessage(ukrainianCopy.renderД, { wohAfterDays: row.wohAfterDays }) : "∞" },
];

export default function PromoTableModal({
  params,
  onClose,
}: {
  params: PromoSimParams;
  onClose: () => void;
}) {
  const simulation = useAgentSimulation<PromoSimulation>("/api/agents/repricing/simulate", {
    brandId: params.brandId,
    discountPercent: params.discountPercent,
    durationDays: params.durationDays,
    unitsToSellPercent: params.unitsToSellPercent ?? null,
    ...(params.asOf ? { asOf: params.asOf } : {}),
    ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
  });

  const title = formatMessage(ukrainianCopy.titleУцінка, { brandName: params.brandName, strategyType: params.strategyType, label: params.label, value4: new Date().toISOString().slice(0, 10) });
  return (
    <SimulationDialog
      simulation={simulation}
      title={<span className="block truncate">{params.brandName} · <span className="text-accent-purple">{params.strategyType}</span> {params.label}</span>}
      subtitle={ukrainianCopy.subtitleРозрахунокАкціїБезAI}
      closeLabel={ukrainianCopy.closeLabelЗакритиТаблицюУцінки}
      onClose={onClose}
    >
      {(sim) => <PromoResult simulation={sim} title={title} scenarioTitle={`${params.strategyType} — ${params.label}`} />}
    </SimulationDialog>
  );
}

function PromoResult({ simulation: sim, title, scenarioTitle }: {
  simulation: PromoSimulation;
  title: string;
  scenarioTitle: string;
}) {
  const { totals } = sim;
  const marginDeltaUah = totals.promoMarginUah - totals.baselineMarginUah;
  const metrics = [
    { label: ukrainianCopy.labelПозицій, value: totals.skuCount },
    { label: ukrainianCopy.labelЗалишок, value: `${fmtUah(totals.stock)} шт` },
    { label: ukrainianCopy.labelПрогнозАкції, value: `${fmtUah(totals.promoUnits)} шт`, color: "var(--violet-ink)" },
    { label: ukrainianCopy.labelВиручкаАкції, value: `${fmtUah(totals.promoRevenue)} грн`, color: "var(--cyan-ink)" },
    {
      label: ukrainianCopy.labelМаржаVsБезАкції,
      value: `${marginDeltaUah > 0 ? "+" : ""}${fmtUah(marginDeltaUah)} грн`,
      color: marginDeltaUah < 0 ? "var(--amber-ink)" : "var(--cyan-ink)",
    },
    { label: ukrainianCopy.labelЗвільненийКапітал, value: `${fmtUah(totals.capitalReleased)} грн`, color: "var(--cyan-ink)" },
  ];

  return (
    <>
      <ExcelExportButton
        title={title}
        sheetName={ukrainianCopy.sheetNameУцінка}
        buildValues={() => buildPromoSheetValues(sim, { title: scenarioTitle, formulas: true })}
        disabled={sim.rows.length === 0}
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => <MetricTile key={metric.label} variant="summary" {...metric} />)}
      </dl>

      <p className="font-mono text-[10px] text-(--subtle)">{ukrainianCopy.параметриСценаріюВідAIАгента}{sim.forecastModel === "ai_percent"
          ? formatMessage(ukrainianCopy.залишкуКожногоSKUОцінка, { unitsToSellPercent: sim.unitsToSellPercent })
          : ukrainianCopy.еластичність2ВідШвидкостіПродажів}{ukrainianCopy.даніЗа}{sim.periodDays}{ukrainianCopy.дн}{sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? ukrainianCopy.сьогодні})` : ""}{ukrainianCopy.вЕкспортіЗнижкаВ}</p>

      <SimulationTable
        rows={sim.rows}
        columns={promoColumns}
        emptyMessage={ukrainianCopy.emptyMessageНемаєSKUЗПозитивнимЗалишком}
        totals={
          <>
            <td>{fmtUah(totals.stock)}</td>
            <td colSpan={4} />
            <td>{fmtUah(totals.promoUnits)}</td>
            <td>{fmtUah(totals.promoRevenue)}</td>
            <td>{fmtUah(totals.promoMarginUah)}</td>
            <td className="text-accent-cyan">{fmtUah(totals.capitalReleased)}</td>
            <td />
          </>
        }
      />
    </>
  );
}
