"use client";

import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { PromoSimulation, PromoSkuRow } from "@/lib/promo-calc";
import { buildPromoSheetValues } from "@/lib/promo-sheet";
import { ExcelExportButton } from "@/components/agents/excel-export-button/excel-export-button";

import { SimulationDialog } from "../simulation-dialog/simulation-dialog";
import { SimulationTable, type SimulationColumn } from "../simulation-table/simulation-table";
import { useAgentSimulation } from "../use-agent-simulation";

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
  { label: "Назва", render: (row) => row.name, title: (row) => row.name, className: "max-w-[180px] truncate" },
  { label: "Залишок", render: (row) => row.stock },
  { label: "Ціна", render: (row) => fmtUah(row.priceRetail) },
  { label: "Зі знижкою", render: (row) => fmtUah(row.newPrice), className: "text-accent-purple" },
  { label: "Маржа до", render: (row) => formatPercent(row.marginBeforePct) },
  {
    label: "Маржа після",
    render: (row) => formatPercent(row.marginAfterPct),
    className: ({ marginAfterPct }) => {
      if (marginAfterPct == null) return "";
      if (marginAfterPct < 0) return "text-accent-danger";
      return marginAfterPct < 15 ? "text-accent-yellow" : "";
    },
  },
  { label: "Прогноз, шт", render: (row) => row.promoUnits, className: "text-(--text)" },
  { label: "Виручка", render: (row) => fmtUah(row.promoRevenue) },
  {
    label: "Маржа, грн",
    render: (row) => fmtUah(row.promoMarginUah),
    className: (row) => row.promoMarginUah < 0 ? "text-accent-danger" : "",
  },
  { label: "Капітал", render: (row) => fmtUah(row.capitalReleased), className: "text-accent-cyan" },
  { label: "DOH після", render: (row) => row.wohAfterDays != null ? `${row.wohAfterDays}д` : "∞" },
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

  const title = `Уцінка ${params.brandName} · ${params.strategyType} ${params.label} · ${new Date().toISOString().slice(0, 10)}`;
  return (
    <SimulationDialog
      simulation={simulation}
      title={<span className="block truncate">{params.brandName} · <span className="text-accent-purple">{params.strategyType}</span> {params.label}</span>}
      subtitle="Розрахунок акції · без AI, чиста математика"
      closeLabel="Закрити таблицю уцінки"
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
    { label: "Позицій", value: totals.skuCount },
    { label: "Залишок", value: `${fmtUah(totals.stock)} шт` },
    { label: "Прогноз акції", value: `${fmtUah(totals.promoUnits)} шт`, color: "var(--violet-ink)" },
    { label: "Виручка акції", value: `${fmtUah(totals.promoRevenue)} грн`, color: "var(--cyan-ink)" },
    {
      label: "Маржа vs без акції",
      value: `${marginDeltaUah > 0 ? "+" : ""}${fmtUah(marginDeltaUah)} грн`,
      color: marginDeltaUah < 0 ? "var(--amber-ink)" : "var(--cyan-ink)",
    },
    { label: "Звільнений капітал", value: `${fmtUah(totals.capitalReleased)} грн`, color: "var(--cyan-ink)" },
  ];

  return (
    <>
      <ExcelExportButton
        title={title}
        sheetName="Уцінка"
        buildValues={() => buildPromoSheetValues(sim, { title: scenarioTitle, formulas: true })}
        disabled={sim.rows.length === 0}
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => <MetricTile key={metric.label} variant="summary" {...metric} />)}
      </dl>

      <p className="font-mono text-[10px] text-(--subtle)">
        Параметри сценарію — від AI-агента; розрахунок таблиці — детермінований (PostgreSQL + формули).
        Прогноз: {sim.forecastModel === "ai_percent"
          ? `${sim.unitsToSellPercent}% залишку кожного SKU (оцінка AI)`
          : "еластичність ×2 від швидкості продажів"}.
        Дані за {sim.periodDays} дн.{sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? "сьогодні"})` : ""}.
        В експорті знижка в клітинці B2 — формули перерахуються автоматично.
      </p>

      <SimulationTable
        rows={sim.rows}
        columns={promoColumns}
        emptyMessage="Немає SKU з позитивним залишком для цього бренда."
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
