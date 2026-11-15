"use client";

import { Button } from "@/components/ui/button/button";
import type { Brand, CatalogUpload } from "../planner-types";

export function PlannerBrands({ brands, catalogs, onEdit, fmt }: {
  brands: Brand[];
  catalogs: CatalogUpload[];
  onEdit: (brand: Brand) => void;
  fmt: (value: number) => string;
}) {
  const catalogCounts = new Map<string, number>();
  for (const catalog of catalogs) {
    catalogCounts.set(catalog.brandId, (catalogCounts.get(catalog.brandId) ?? 0) + 1);
  }

  return (
    <div className="max-w-3xl">
      {brands.length === 0 ? (
        <div className="text-center py-16 text-(--muted)">
          Брендів ще немає. Натисніть «Додати бренд» щоб почати.
        </div>
      ) : null}
      <div className="space-y-3">
        {brands.map(brand => (
          <Button
            key={brand.id}
            variant="report"
            aria-label={`Редагувати бренд ${brand.name}`}
            onClick={() => onEdit(brand)}
            className="block w-full rounded-xl bg-(--surface) p-5 text-left font-normal hover:bg-(--surface) hover:border-white/[0.14]"
          >
            <span className="flex items-start justify-between">
              <span>
                <span className="block text-(--text) font-semibold mb-1">{brand.name}</span>
                <span className="flex items-center gap-3 text-[11px] font-mono text-(--muted)">
                  <span>Budget: {brand.currency}{fmt(brand.budget)}</span>
                  <span>Net {brand.paymentDays}d</span>
                  <span>Lead {brand.leadTimeDays}d</span>
                  {brand.country ? <span>{brand.country}</span> : null}
                </span>
              </span>
              <span className="text-xs text-(--subtle)">{catalogCounts.get(brand.id) ?? 0} каталогів</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
