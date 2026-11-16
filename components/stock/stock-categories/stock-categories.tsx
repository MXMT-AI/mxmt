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
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">K3 · {copy.categories}</Heading>
        <Note>{copy.categoryBasis}</Note>
        <Note>
          {copy.sortBy}:{" "}
          {model.categorySort === "name"
            ? copy.name
            : model.categorySort === "stockCost"
              ? copy.total
              : model.categorySort === "OTHER"
                ? copy.other
                : statusName(copy, model.categorySort)}{" "}
          {model.categoryDirection === "desc" ? "↓" : "↑"}
        </Note>
        {model.selectedStatus ? <Note>{copy.groupFilter}</Note> : null}
      </div>
      <ReportTable
        columns={columns}
        rows={groups.rows.map((r) => ({
          ...r,
          id: r.id ?? "__unassigned__",
          source: r,
          ...Object.fromEntries(
            primary.map((s) => [
              s,
              r.statuses.find((c) => c.status === s)?.stockCost ?? null,
            ]),
          ),
          OTHER: r.otherCost,
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
          const r = row.source as Group;
          if (col.key === "name")
            return (
              <Link
                className="underline underline-offset-4"
                href={scoped({
                  categoryId: r.id ?? "__unassigned__",
                  groupBy: "sku",
                  page: null,
                })}
              >
                {r.id === null ? copy.unassigned : r.name}
              </Link>
            );
          if (col.key === "structure")
            return <StockStructure row={r} copy={copy} locale={locale} />;
          const status = r.statuses.find((s) => s.status === col.key);
          return (
            <Link
              className="underline underline-offset-4"
              href={scoped({
                categoryId: r.id ?? "__unassigned__",
                groupBy: "sku",
                classification: status
                  ? status.status
                  : col.key === "OTHER"
                    ? null
                    : model.selectedStatus,
                page: null,
              })}
            >
              <StockCost
                value={row[col.key] as string | null}
                covered={
                  col.key === "stockCost"
                    ? r.coveredStockCost
                    : status?.coveredStockCost
                }
                locale={locale}
                copy={copy}
              />
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
