"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "../planner-types";
import { parsePlannerQuantity } from "../planner-quantity";

export function PlannerCatalogCard({ item, addToCart }: {
  item: CatalogItem;
  addToCart: (item: CatalogItem, qty: number) => void;
}) {
  const quantity = useRef<HTMLInputElement>(null);
  const margin = item.priceRetail
    ? Math.round(((item.priceRetail - item.priceWholesale) / item.priceRetail) * 100)
    : null;

  function add() {
    const input = quantity.current;
    if (!input) return;
    const qty = parsePlannerQuantity(input.value, input.validity.badInput, item.minOrder);
    if (qty === null) {
      input.setCustomValidity("Вкажіть додатну цілу кількість.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    addToCart(item, qty);
  }

  return (
    <div className="bg-(--surface) border border-(--border) rounded-xl p-4 hover:border-white/[0.14] transition-colors group">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-mono text-accent-cyan">{item.sku}</span>
        {margin !== null ? <span className="text-[10px] font-mono bg-[#3fb950]/10 text-[#3fb950] px-1.5 py-0.5 rounded-sm">{margin}%</span> : null}
      </div>
      <p className="text-sm text-(--text) font-medium leading-snug mb-1 line-clamp-2">{item.name}</p>
      <p className="text-[11px] text-(--muted) mb-2">
        {item.brand.name} · {item.category}{item.color && ` · ${item.color}`}
      </p>
      <div className="text-lg font-bold font-mono text-(--text) mb-3">{item.brand.currency}{item.priceWholesale.toFixed(0)}</div>
      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 2).map(tag => <span key={tag} className="text-[9px] bg-white/5 text-(--muted) px-1.5 py-0.5 rounded-sm">{tag}</span>)}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-(--subtle)">{item.stockAvail} avail</span>
        <input
          ref={quantity}
          type="number"
          aria-label={`Кількість для ${item.name} (${item.sku})`}
          min={1}
          step={1}
          defaultValue={item.minOrder}
          onInput={event => event.currentTarget.setCustomValidity("")}
          className={cn(control, "min-h-0 w-12 bg-white/5 text-xs rounded-sm px-1.5 py-1 text-center")}
        />
        <Button variant="report" tone="positive" onClick={add} className="min-h-0 flex-1 text-xs font-medium px-0 py-1.5">
          + Додати
        </Button>
      </div>
    </div>
  );
}
