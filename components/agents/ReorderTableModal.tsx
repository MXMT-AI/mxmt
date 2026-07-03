"use client";

import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, AlertTriangle } from "lucide-react";
import type { ReorderSimulation } from "@/lib/reorder-calc";
import { buildReorderSheetValues } from "@/lib/reorder-sheet";
import ExportButtons from "@/components/agents/ExportButtons";

export interface ReorderSimParams {
  brandId: string;
  brandName: string;
  type: string; // PESSIMISTIC | REALISTIC | OPTIMISTIC
  label: string; // "Минимальный дозаказ"
  qtyMultiplier: number;
  asOf?: string | null;
  dateFrom?: string | null;
}

const fmtUah = (n: number) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);

export default function ReorderTableModal({
  params,
  onClose,
}: {
  params: ReorderSimParams;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [sim, setSim] = useState<ReorderSimulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents/reordering/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: params.brandId,
            qtyMultiplier: params.qtyMultiplier,
            ...(params.asOf ? { asOf: params.asOf } : {}),
            ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? "Невідома помилка");
        else setSim(data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  const title = `Дозамовлення ${params.brandName} · ${params.type} ×${params.qtyMultiplier} · ${new Date().toISOString().slice(0, 10)}`;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10 gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-0.5">
              Розрахунок дозамовлення · без AI, чиста математика
            </div>
            <h2 className="text-base font-bold text-[var(--text)] truncate">
              {params.brandName} · <span className="text-[#a78bfa]">{params.type}</span> {params.label} (×{params.qtyMultiplier})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Export */}
          {sim && (
            <ExportButtons
              title={title}
              sheetName="Дозамовлення"
              buildValues={(formulas) =>
                buildReorderSheetValues(sim, { title: `${params.type} — ${params.label}`, formulas })
              }
              disabled={!sim || sim.rows.length === 0}
            />
          )}

          {/* Loading / error */}
          {!sim && !error && (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--muted)] text-sm">
              <RefreshCw size={14} className="animate-spin" /> Розрахунок…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-xl px-4 py-3">
              <AlertTriangle size={13} className="text-[#ef4444] flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[var(--muted)]">{error}</p>
            </div>
          )}

          {sim && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { label: "Позицій", value: String(sim.totals.skuCount) },
                  { label: "Залишок зараз", value: `${fmtUah(sim.totals.stock)} шт` },
                  { label: "Дозамовлення", value: `${fmtUah(sim.totals.orderQty)} шт`, color: "#a78bfa" },
                  { label: "Вартість замовлення", value: `${fmtUah(sim.totals.orderCost)} грн`, color: "#fbbf24" },
                  { label: "Залишок після", value: `${fmtUah(sim.totals.stockAfter)} шт`, color: "#00e5c4" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl px-3 py-2.5">
                    <div className="text-[9px] font-mono uppercase text-[var(--subtle)]">{label}</div>
                    <div className="text-[13px] font-mono font-semibold mt-0.5" style={{ color: color ?? "var(--text)" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Model note */}
              <p className="text-[10px] font-mono text-[var(--subtle)]">
                Сценарій — від AI-агента; розрахунок — детермінований: замовлення = швидкість × {sim.coverDays} дн × {sim.qtyMultiplier} − залишок.
                {sim.leadTimeDays != null ? ` Lead time бренда: ${sim.leadTimeDays} дн.` : ""}
                {" "}Дані за {sim.periodDays} дн.{sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? "сьогодні"})` : ""}.
                В експорті покриття в B2 і множник в E2 — формули перерахуються автоматично.
              </p>

              {/* Table */}
              {sim.rows.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-6 text-center">
                  Немає SKU з продажами або залишком для цього бренда.
                </p>
              ) : (
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                  <table className="w-full text-[11px] font-mono whitespace-nowrap">
                    <thead>
                      <tr className="bg-[var(--surface2)] text-[var(--subtle)] text-[9px] uppercase tracking-wide">
                        {["SKU", "Назва", "Залишок", "Шт/день", "WOH зараз", "Дозамовлення", "Закупка", "Вартість", "Залишок після", "WOH після"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {sim.rows.map((r) => (
                        <tr key={r.sku} className="text-[var(--muted)] hover:bg-white/[0.02]">
                          <td className="px-3 py-1.5 text-[var(--text)]">{r.sku}</td>
                          <td className="px-3 py-1.5 max-w-[180px] truncate" title={r.name}>{r.name}</td>
                          <td className="px-3 py-1.5">{r.stock}</td>
                          <td className="px-3 py-1.5">{r.velocityPerDay}</td>
                          <td className="px-3 py-1.5" style={{ color: (r.wohNowDays ?? 999) < 14 ? "#ef4444" : (r.wohNowDays ?? 999) < 30 ? "#fbbf24" : "var(--muted)" }}>
                            {r.wohNowDays != null ? `${r.wohNowDays}д` : "∞"}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text)] font-semibold">{r.orderQty}</td>
                          <td className="px-3 py-1.5">{fmtUah(r.pricePurchase)}</td>
                          <td className="px-3 py-1.5 text-[#fbbf24]">{fmtUah(r.orderCost)}</td>
                          <td className="px-3 py-1.5">{r.stockAfter}</td>
                          <td className="px-3 py-1.5 text-[#00e5c4]">{r.wohAfterDays != null ? `${r.wohAfterDays}д` : "∞"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--surface2)] text-[var(--text)] font-semibold">
                        <td className="px-3 py-2" colSpan={2}>РАЗОМ</td>
                        <td className="px-3 py-2">{fmtUah(sim.totals.stock)}</td>
                        <td className="px-3 py-2" colSpan={2}></td>
                        <td className="px-3 py-2">{fmtUah(sim.totals.orderQty)}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-[#fbbf24]">{fmtUah(sim.totals.orderCost)}</td>
                        <td className="px-3 py-2">{fmtUah(sim.totals.stockAfter)}</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
