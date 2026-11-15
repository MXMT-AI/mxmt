"use client";

import { ExcelExportButton } from "@/components/agents/excel-export-button/excel-export-button";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { ReorderSimulation, ReorderSkuRow } from "@/lib/legacy-reorder-calc";
import { buildReorderSheetValues } from "@/lib/reorder-sheet";

import { SimulationDialog } from "../simulation-dialog/simulation-dialog";
import { SimulationTable, type SimulationColumn } from "../simulation-table/simulation-table";
import { useAgentSimulation } from "../use-agent-simulation";

export interface ReorderSimParams {
  brandId: string;
  brandName: string;
  type: string;
  label: string;
  qtyMultiplier: number;
  asOf?: string | null;
  dateFrom?: string | null;
}

const amountFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const formatAmount = (value: number) => amountFormatter.format(value);
const formatDays = (days: number | null) => days != null ? `${days}д` : "∞";

const reorderColumns: SimulationColumn<ReorderSkuRow>[] = [
  { label: "SKU", render: (row) => row.sku, className: "text-(--text)" },
  { label: "Назва", render: (row) => row.name, title: (row) => row.name, className: "max-w-[180px] truncate" },
  { label: "Залишок", render: (row) => row.stock },
  { label: "Шт/день", render: (row) => row.velocityPerDay },
  {
    label: "DOH зараз",
    render: (row) => formatDays(row.wohNowDays),
    className: ({ wohNowDays }) => {
      if (wohNowDays == null) return "";
      if (wohNowDays < 14) return "text-accent-danger";
      return wohNowDays < 30 ? "text-accent-yellow" : "";
    },
  },
  { label: "Дозамовлення", render: (row) => row.orderQty, className: "font-semibold text-(--text)" },
  { label: "Закупка", render: (row) => formatAmount(row.pricePurchase) },
  { label: "Вартість", render: (row) => formatAmount(row.orderCost), className: "text-accent-yellow" },
  { label: "Залишок після", render: (row) => row.stockAfter },
  { label: "DOH після", render: (row) => formatDays(row.wohAfterDays), className: "text-accent-cyan" },
];

export default function ReorderTableModal({ params, onClose }: {
  params: ReorderSimParams;
  onClose: () => void;
}) {
  const simulation = useAgentSimulation<ReorderSimulation>("/api/agents/reordering/simulate", {
    brandId: params.brandId,
    qtyMultiplier: params.qtyMultiplier,
    ...(params.asOf ? { asOf: params.asOf } : {}),
    ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
  });

  const title = `Дозамовлення ${params.brandName} · ${params.type} ×${params.qtyMultiplier} · ${new Date().toISOString().slice(0, 10)}`;
  return (
    <SimulationDialog
      simulation={simulation}
      title={<span className="block truncate">{params.brandName} · <span className="text-accent-purple">{params.type}</span> {params.label} (×{params.qtyMultiplier})</span>}
      subtitle="Розрахунок дозамовлення · без AI, чиста математика"
      closeLabel="Закрити таблицю дозамовлення"
      onClose={onClose}
    >
      {(sim) => <ReorderResult simulation={sim} title={title} scenarioTitle={`${params.type} — ${params.label}`} />}
    </SimulationDialog>
  );
}

function ReorderResult({ simulation: sim, title, scenarioTitle }: {
  simulation: ReorderSimulation;
  title: string;
  scenarioTitle: string;
}) {
  const { totals } = sim;
  const metrics = [
    { label: "Позицій", value: totals.skuCount },
    { label: "Залишок зараз", value: `${formatAmount(totals.stock)} шт` },
    { label: "Дозамовлення", value: `${formatAmount(totals.orderQty)} шт`, color: "var(--violet-ink)" },
    { label: "Вартість замовлення", value: `${formatAmount(totals.orderCost)} грн`, color: "var(--amber-ink)" },
    { label: "Залишок після", value: `${formatAmount(totals.stockAfter)} шт`, color: "var(--cyan-ink)" },
  ];

  return (
    <>
      <ExcelExportButton
        title={title}
        sheetName="Дозамовлення"
        buildValues={() => buildReorderSheetValues(sim, { title: scenarioTitle, formulas: true })}
        disabled={sim.rows.length === 0}
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => <MetricTile key={metric.label} variant="summary" {...metric} />)}
      </dl>

      <p className="font-mono text-[10px] text-(--subtle)">
        Сценарій перевірено сервером; розрахунок детермінований: замовлення = чиста швидкість × {sim.coverDays} дн × {sim.qtyMultiplier} − залишок.
        {sim.leadTimeDays != null
          ? ` Lead time бренда: ${sim.leadTimeDays} дн.`
          : " Lead time і MOQ постачальника не задані — перевірте їх перед замовленням."}
        {" "}Дані за {sim.periodDays} дн.{sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? "сьогодні"})` : ""}.
        В експорті покриття в B2 і множник в E2 — формули перерахуються автоматично.
      </p>

      <SimulationTable
        rows={sim.rows}
        columns={reorderColumns}
        emptyMessage="Немає SKU з продажами або залишком для цього бренда."
        totals={
          <>
            <td>{formatAmount(totals.stock)}</td>
            <td colSpan={2} />
            <td>{formatAmount(totals.orderQty)}</td>
            <td />
            <td className="text-accent-yellow">{formatAmount(totals.orderCost)}</td>
            <td>{formatAmount(totals.stockAfter)}</td>
            <td />
          </>
        }
      />
    </>
  );
}
