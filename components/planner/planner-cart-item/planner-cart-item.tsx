"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { CartItem } from "../planner-types";
import { parsePlannerQuantity } from "../planner-quantity";

export function PlannerCartItem({ item, removeFromCart, updateQty, fmt }: {
  item: CartItem;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  fmt: (value: number) => string;
}) {
  const [edit, setEdit] = useState({ quantity: item.qty, text: String(item.qty) });
  const draft = edit.quantity === item.qty ? edit.text : String(item.qty);

  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-(--text) font-medium truncate">{item.name}</p>
        <p className="text-[10px] font-mono text-(--muted)">{item.sku} · {item.category}</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          aria-label={`Кількість для ${item.name} (${item.sku})`}
          min={1}
          step={1}
          value={draft}
          onChange={event => {
            const input = event.currentTarget;
            setEdit({ quantity: item.qty, text: input.value });
            const qty = parsePlannerQuantity(input.value, input.validity.badInput);
            if (qty !== null && qty !== item.qty) updateQty(item.catalogItemId, qty);
          }}
          onBlur={() => setEdit({ quantity: item.qty, text: String(item.qty) })}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className={cn(control, "min-h-0 w-14 bg-white/5 px-2 py-1.5 text-center")}
        />
        <span className="text-sm font-mono text-(--text) w-20 text-right">€{fmt(item.price * item.qty)}</span>
        <Button
          variant="icon"
          aria-label={`Видалити ${item.name} (${item.sku}) із замовлення`}
          onClick={() => removeFromCart(item.catalogItemId)}
          className="min-h-0 min-w-0 rounded-none border-0 bg-transparent p-0 hover:bg-transparent hover:text-accent-orange"
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
