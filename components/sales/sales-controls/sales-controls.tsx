import type { SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesHref } from "../sales-types";
import { SalesControlGroup } from "../sales-control-group/sales-control-group";

export function SalesControls({ model, copy, href }: {
  model: Pick<SalesWorkspaceModel, "groupBy" | "measure" | "metric" | "monobrand">;
  copy: SalesCopy;
  href: SalesHref;
}) {
  const resetPages = { page: null, others: null, channelPage: null };
  return (
    <div className="flex flex-wrap gap-5 items-end">
      <SalesControlGroup
        label={copy.group}
        value={model.groupBy}
        options={[
          ...(!model.monobrand ? [{ key: "brand", label: copy.brand }] : []),
          { key: "category", label: copy.category },
          { key: "sku", label: copy.sku },
        ].map(option => ({ ...option, href: href({ groupBy: option.key, ...resetPages }) }))}
      />
      <SalesControlGroup
        label={copy.measure}
        value={model.measure}
        options={[
          { key: "money", label: copy.money },
          { key: "units", label: copy.units },
        ].map(option => ({
          ...option,
          href: href({ measure: option.key, ...resetPages, ...(option.key === "units" ? { metric: "revenue" } : {}) }),
        }))}
      />
      <SalesControlGroup
        label={copy.metric}
        value={model.metric}
        options={(["revenue", "coveredGrossProfit", "gmPct"] as const).map(metric =>
          model.measure === "units"
            ? { key: metric, label: copy[metric], disabled: true, title: copy.financialDisabled }
            : { key: metric, label: copy[metric], href: href({ metric, page: null }) },
        )}
      />
    </div>
  );
}
