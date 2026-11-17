"use client";

import { AlertTriangle, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { Badge } from "@/components/ui/badge/badge";
import type { CatalogItem } from "../planner-types";

export function PlannerDuplicates({ groups, addToCart }: {
  groups: CatalogItem[][];
  addToCart: (item: CatalogItem, qty: number) => void;
}) {
  const visibleGroups = groups.filter((group): group is [CatalogItem, ...CatalogItem[]] => group.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="text-center py-20">
        <GitCompare aria-hidden="true" size={40} className="mx-auto text-(--subtle) mb-4" />
        <p className="text-(--text) font-medium mb-1">Сканування ще не виконано</p>
        <p className="text-(--muted) text-sm">Натисніть «Сканувати» щоб знайти схожі позиції між брендами</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-(--muted) text-sm mb-4">
        Знайдено {visibleGroups.length} {visibleGroups.length === 1 ? "групу" : "групи"} схожих позицій між різними брендами
      </p>
      {visibleGroups.map((group, i) => (
        <div key={i} className="bg-(--surface) border border-accent-orange/20 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle aria-hidden="true" size={14} className="text-accent-orange" />
              <span className="text-(--text) font-medium text-sm">
                {group[0].category}
                {group[0].color && ` · ${group[0].color}`}
                {group[0].style && ` · ${group[0].style}`}
              </span>
            </div>
            <Badge outlined={false} className="bg-accent-orange/10 text-accent-orange">
              {group.length} brands
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {group.map((item) => (
              <div key={item.id} className="bg-white/3 border border-(--border) rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-mono text-accent-cyan">{item.brand.name}</span>
                  <span className="text-sm font-bold text-(--text)">{item.brand.currency}{item.priceWholesale}</span>
                </div>
                <p className="text-sm text-(--text) font-medium mb-1">{item.name}</p>
                <p className="text-[11px] text-(--muted) mb-2 font-mono">{item.sku}</p>
                <Button
                  variant="report" tone="positive"
                  onClick={() => addToCart(item, item.minOrder)}
                  className="min-h-0 w-full text-[11px] py-1.5"
                >
                  До замовлення
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
