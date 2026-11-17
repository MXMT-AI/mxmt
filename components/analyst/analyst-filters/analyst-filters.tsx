import { Button } from "@/components/ui/button/button";
import { panel } from "@/components/ui/panel/panel-styles";
import type { ClassifySummary, SkuFlag } from "@/lib/analyst-types";
import { cn } from "@/lib/utils";

import { SKU_FLAGS, type AnalystFilter } from "../sku-flags";

interface AnalystFiltersProps {
  summary: ClassifySummary;
  locale: "uk" | "en";
  activeFlag: AnalystFilter;
  onFilter: (flag: AnalystFilter) => void;
}

const flags = Object.keys(SKU_FLAGS) as SkuFlag[];
const filterButtonClassName = "border-transparent px-3 py-1.5 font-sans text-sm font-medium";

export function AnalystFilterCards({ summary, locale, activeFlag, onFilter }: AnalystFiltersProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {flags.map((flag) => {
        const status = SKU_FLAGS[flag];
        const selected = activeFlag === flag;

        return (
          <Button
            key={flag}
            aria-pressed={selected}
            onClick={() => onFilter(selected ? "all" : flag)}
            className={cn(
              panel,
              "block p-4 text-left font-sans hover:border-(--muted)",
              selected && "border-(--muted)",
            )}
          >
            <span className="mb-1 block text-2xl" aria-hidden="true">{status.emoji}</span>
            <span className={cn("block font-mono text-xl font-bold", status.color)}>{summary[flag]}</span>
            <span className="mt-0.5 block text-[10px] text-(--muted)">{status[locale]}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function AnalystFilterButtons({ summary, locale, activeFlag, onFilter }: AnalystFiltersProps) {
  return (
    <>
      <Button
        onClick={() => onFilter("all")}
        aria-pressed={activeFlag === "all"}
        className={cn(filterButtonClassName, activeFlag === "all" && "bg-(--input-bg) text-(--text)")}
      >
        {locale === "uk" ? "Всі" : "All"} ({summary.total})
      </Button>
      {flags.filter((flag) => flag !== "ok" && summary[flag] > 0).map((flag) => {
        const status = SKU_FLAGS[flag];
        return (
          <Button
            key={flag}
            onClick={() => onFilter(flag)}
            aria-pressed={activeFlag === flag}
            className={cn(filterButtonClassName, activeFlag === flag && [status.background, status.color])}
          >
            <span aria-hidden="true">{status.emoji}</span> {status[locale]} ({summary[flag]})
          </Button>
        );
      })}
    </>
  );
}
