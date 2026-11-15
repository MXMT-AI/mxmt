import { useId, useState } from "react";
import { TrendingDown, TrendingUp, Minus, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge/badge";
import type { BrandResult } from "@/components/agents/agents.types";
import { formatWohDays } from "@/components/agents/agents.utils";
import { getBrandStatus } from "../brand-status";

export function BrandCard({ b }: { b: BrandResult }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { color, label } = getBrandStatus(b.status);

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${color} 22%, transparent)` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-semibold text-(--text) text-sm">{b.brand_name}</span>
          <Badge
            outlined={false}
            className="px-1.5"
            style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}
          >
            {label}
          </Badge>
          {b.urgency === "immediate" && (
            <span className="text-[10px] font-mono text-accent-danger">● негайно</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {b.metrics && (
            <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-(--muted)">
              <span>WOH <span className="text-(--text)">{formatWohDays(b.metrics.wohDays)}</span></span>
              <span>STR <span className="text-(--text)">{b.metrics.strPercent}%</span></span>
              <span>
                {b.metrics.trend7dPct > 0 ? (
                  <TrendingUp size={11} className="inline text-accent-positive" aria-hidden="true" />
                ) : b.metrics.trend7dPct < 0 ? (
                  <TrendingDown size={11} className="inline text-accent-negative" aria-hidden="true" />
                ) : (
                  <Minus size={11} className="inline text-(--subtle)" aria-hidden="true" />
                )}
                {" "}{b.metrics.trend7dPct > 0 ? "+" : ""}{b.metrics.trend7dPct}%
              </span>
            </div>
          )}
          <ChevronDown size={14} className="text-(--subtle) group-aria-expanded:rotate-180" aria-hidden="true" />
        </div>
      </button>

      <div id={panelId} hidden={!open} className="px-4 pb-4 space-y-3 border-t border-(--border-faint)">
        {open && (
          <>
            <p className="text-sm text-(--muted) mt-3">{b.analysis}</p>
            {b.metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {[
                  { label: "Склад", value: b.metrics.totalStock + " шт" },
                  { label: "Продаж 7д", value: b.metrics.salesLast7d + " шт" },
                  { label: "Продаж 30д", value: b.metrics.salesLast30d + " шт" },
                  { label: "GM", value: b.metrics.gmPercent + "%" },
                ].map((item) => (
                  <div key={item.label} className="bg-(--row) rounded-lg px-3 py-2">
                    <div className="text-[9px] font-mono uppercase text-(--subtle)">{item.label}</div>
                    <div className="text-sm font-mono font-semibold text-(--text) mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
            {b.suggested_actions?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-[10px] text-(--subtle)">Дії:</span>
                {b.suggested_actions.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
