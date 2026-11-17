"use client";
import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { Pager } from "@/components/ui/pager/pager";
import { StockCost } from "../stock-cost/stock-cost";
import type { StockCopy } from "@/lib/stock-copy";
import type { Block, Group, Href } from "../stock-content/stock-content-types";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import type { StockWorkspaceModel } from "@/lib/merchandising-stock-workspace";
import { StockStructure } from "../stock-structure/stock-structure";
import { primaryStockStatuses as primary, stockStatusLabel as statusName } from "@/lib/merchandising-stock-display";

export function StockCategories({ groups, model, copy, locale, href: scoped, onNavigate }: {
  groups: Block["categories"];
  model: Pick<StockWorkspaceModel, "categorySort" | "categoryDirection" | "selectedStatus">;
  copy: StockCopy;
  locale: string;
  href: Href;
  onNavigate?: (href: string) => void;
}) {
  const formatValue = createTableValueFormatter(locale);
  const columns: DataColumnMetadata[] = [
    { key: "name", label: copy.name, type: "text" },
    ...primary.map((key) => ({
      key,
      label: statusName(copy, key),
      type: "money" as const,
    })),
    { key: "OTHER", label: copy.other, type: "money" },
    { key: "stockCost", label: copy.total, type: "money" },
    { key: "structure", label: copy.structure, type: "text" },
  ];
  const sortLabel = columns.find((column) => column.key === model.categorySort)?.label
    ?? statusName(copy, model.categorySort);
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">K3 · {copy.categories}</Heading>
        <Note>{copy.categoryBasis}</Note>
        <Note>
          {copy.sortBy}: {sortLabel} {model.categoryDirection === "desc" ? "↓" : "↑"}
        </Note>
        {model.selectedStatus ? <Note>{copy.groupFilter}</Note> : null}
      </div>
      <ReportTable
        columns={columns}
        rows={groups.rows.map((group) => ({
          id: group.id ?? "__unassigned__",
          currency: group.currency,
          source: group,
        }))}
        locale={locale}
        sortColumn={model.categorySort}
        direction={model.categoryDirection}
        isSortable={(col) =>
          Boolean(onNavigate) && col.key !== "structure"
        }
        onSort={(col) =>
          onNavigate?.(
            scoped({
              categorySort: col.key,
              categoryDirection:
                model.categorySort === col.key &&
                model.categoryDirection === "desc"
                  ? "asc"
                  : "desc",
              categoryPage: null,
            }),
          )
        }
        renderCell={(row, col) => {
          const group = row.source as Group;
          if (col.key === "structure")
            return <StockStructure statuses={group.statuses} copy={copy} formatValue={formatValue} />;

          const drillDown = {
            categoryId: group.id ?? "__unassigned__",
            groupBy: "sku",
            page: null,
          };
          const isName = col.key === "name";
          const isTotal = col.key === "stockCost";
          const isOther = col.key === "OTHER";
          const status = isName ? undefined : group.statuses.find((entry) => entry.status === col.key);
          const value = isTotal ? group.stockCost : isOther ? group.otherCost : status?.stockCost ?? null;
          return (
            <Link
              className="underline underline-offset-4"
              href={scoped(isName ? drillDown : {
                ...drillDown,
                classification: status?.status ?? (isOther ? null : model.selectedStatus),
              })}
            >
              {isName ? (group.id === null ? copy.unassigned : group.name) : (
                <StockCost
                  value={value}
                  covered={isTotal ? group.coveredStockCost : status?.coveredStockCost}
                  formatValue={formatValue}
                  copy={copy}
                />
              )}
            </Link>
          );
        }}
      />
      {!groups.rows.length ? (
        <Text variant="body" className="leading-normal text-base text-inherit p-5 text-sm text-(--muted)">{copy.empty}</Text>
      ) : null}
      <Pager
        pagination={groups.pagination}
        control="categoryPage"
        href={scoped}
        copy={copy}
      />
    </section>
  );
}
