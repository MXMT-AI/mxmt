"use client";

import { ExcelExportButton } from "@/components/agents/excel-export-button/excel-export-button";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { ReorderSimulation, ReorderSkuRow } from "@/lib/legacy-reorder-calc";
import { buildReorderSheetValues } from "@/lib/reorder-sheet";

import { SimulationDialog } from "../simulation-dialog/simulation-dialog";
import { SimulationTable, type SimulationColumn } from "../simulation-table/simulation-table";
import { useAgentSimulation } from "../use-agent-simulation";
import { formatMessage } from "@/i18n/format-message";
import { agentsReorderTableModalMessages as ukrainianCopy } from "@/messages/uk.json";

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
const formatDays = (days: number | null) => days != null ? formatMessage(ukrainianCopy.formatDaysД, { days }) : "∞";

const reorderColumns: SimulationColumn<ReorderSkuRow>[] = [
  { label: "SKU", render: (row) => row.sku, className: "text-(--text)" },
  { label: ukrainianCopy.labelНазва, render: (row) => row.name, title: (row) => row.name, className: "max-w-[180px] truncate" },
  { label: ukrainianCopy.labelЗалишок, render: (row) => row.stock },
  { label: ukrainianCopy.labelШтДень, render: (row) => row.velocityPerDay },
  {
    label: ukrainianCopy.labelDOHЗараз,
    render: (row) => formatDays(row.wohNowDays),
    className: ({ wohNowDays }) => {
      if (wohNowDays == null) return "";
      if (wohNowDays < 14) return "text-accent-danger";
      return wohNowDays < 30 ? "text-accent-yellow" : "";
    },
  },
  { label: ukrainianCopy.labelДозамовлення, render: (row) => row.orderQty, className: "font-semibold text-(--text)" },
  { label: ukrainianCopy.labelЗакупка, render: (row) => formatAmount(row.pricePurchase) },
  { label: ukrainianCopy.labelВартість, render: (row) => formatAmount(row.orderCost), className: "text-accent-yellow" },
  { label: ukrainianCopy.labelЗалишокПісля, render: (row) => row.stockAfter },
  { label: ukrainianCopy.labelDOHПісля, render: (row) => formatDays(row.wohAfterDays), className: "text-accent-cyan" },
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

  const title = formatMessage(ukrainianCopy.titleДозамовлення, { brandName: params.brandName, type: params.type, qtyMultiplier: params.qtyMultiplier, value4: new Date().toISOString().slice(0, 10) });
  return (
    <SimulationDialog
      simulation={simulation}
      title={<span className="block truncate">{params.brandName} · <span className="text-accent-purple">{params.type}</span> {params.label} (×{params.qtyMultiplier})</span>}
      subtitle={ukrainianCopy.subtitleРозрахунокДозамовленняБезAI}
      closeLabel={ukrainianCopy.closeLabelЗакритиТаблицюДозамовлення}
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
    { label: ukrainianCopy.labelПозицій, value: totals.skuCount },
    { label: ukrainianCopy.labelЗалишокЗараз, value: `${formatAmount(totals.stock)} шт` },
    { label: ukrainianCopy.labelДозамовлення, value: `${formatAmount(totals.orderQty)} шт`, color: "var(--violet-ink)" },
    { label: ukrainianCopy.labelВартістьЗамовлення, value: `${formatAmount(totals.orderCost)} грн`, color: "var(--amber-ink)" },
    { label: ukrainianCopy.labelЗалишокПісля, value: `${formatAmount(totals.stockAfter)} шт`, color: "var(--cyan-ink)" },
  ];

  return (
    <>
      <ExcelExportButton
        title={title}
        sheetName={ukrainianCopy.labelДозамовлення}
        buildValues={() => buildReorderSheetValues(sim, { title: scenarioTitle, formulas: true })}
        disabled={sim.rows.length === 0}
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => <MetricTile key={metric.label} variant="summary" {...metric} />)}
      </dl>

      <p className="font-mono text-[10px] text-(--subtle)">{ukrainianCopy.сценарійПеревіреноСерверомРозрахунокДетермінований}{sim.coverDays}{ukrainianCopy.дн}{sim.qtyMultiplier}{ukrainianCopy.залишок}{sim.leadTimeDays != null
          ? formatMessage(ukrainianCopy.leadTimeБрендаДн, { leadTimeDays: sim.leadTimeDays })
          : ukrainianCopy.leadTimeІMOQПостачальника}
        {" "}{ukrainianCopy.даніЗа}{sim.periodDays}{ukrainianCopy.дн2}{sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? ukrainianCopy.сьогодні})` : ""}{ukrainianCopy.вЕкспортіПокриттяВ}</p>

      <SimulationTable
        rows={sim.rows}
        columns={reorderColumns}
        emptyMessage={ukrainianCopy.emptyMessageНемаєSKUЗПродажамиАбо}
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
