import type { ReactNode } from "react";
import { agentsSimulationTableMessages as ukrainianCopy } from "@/messages/uk.json";

export type SimulationColumn<Row> = {
  label: string;
  render: (row: Row) => ReactNode;
  className?: string | ((row: Row) => string);
  title?: (row: Row) => string;
};

export function SimulationTable<Row extends { sku: string }>({ rows, columns, totals, emptyMessage }: {
  rows: readonly Row[];
  columns: readonly SimulationColumn<Row>[];
  totals: ReactNode;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-(--muted)">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-(--border)">
      <table className="w-full font-mono text-[11px] whitespace-nowrap">
        <thead className="bg-(--surface2) text-[9px] tracking-wide text-(--subtle) uppercase">
          <tr>
            {columns.map(({ label }) => (
              <th key={label} scope="col" className="px-3 py-2 text-left font-normal">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-(--border)">
          {rows.map((row) => (
            <tr key={row.sku} className="text-(--muted) hover:bg-white/2">
              {columns.map(({ label, className, render, title }) => (
                <td
                  key={label}
                  className={`px-3 py-1.5 ${typeof className === "function" ? className(row) : className ?? ""}`}
                  title={title?.(row)}
                >
                  {render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-(--surface2) font-semibold text-(--text)">
          <tr className="[&>td]:px-3 [&>td]:py-2 [&>th]:px-3 [&>th]:py-2">
            <th scope="row" colSpan={2} className="text-left">{ukrainianCopy.рАЗОМ}</th>
            {totals}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
