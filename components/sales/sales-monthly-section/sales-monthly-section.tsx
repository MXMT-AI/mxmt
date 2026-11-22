import { Link } from "@/i18n/navigation";
import { panel } from "@/components/ui/panel/panel-styles";
import { button } from "@/components/ui/button/button-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { Pager } from "@/components/ui/pager/pager";
import type { SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesCurrencyBlock, SalesHref } from "../sales-types";
import { SalesMatrix } from "../sales-matrix/sales-matrix";
import { salesSalesMonthlySectionMessages as englishCopy } from "@/messages/en.json";

export function SalesMonthlySection({ matrix, group, metric, tablePeriod, showOthers, copy, locale, href }: {
  matrix: SalesCurrencyBlock["matrix"];
  group: SalesWorkspaceModel["groupBy"];
  metric: SalesWorkspaceModel["metric"];
  tablePeriod: SalesWorkspaceModel["tablePeriod"];
  showOthers: boolean;
  copy: SalesCopy;
  locale: string;
  href: SalesHref;
}) {
  const hasOthers = matrix.rows.some(row => row.kind === "OTHERS");
  return (
    <section className={panel}>
      <div className="space-y-2 p-5 border-b border-(--border)">
        <Heading as="h3" variant="compact" className="text-base text-inherit">{englishCopy.s1}{copy.monthly}</Heading>
        <Note>
          {copy.tableScope}: {tablePeriod.from} —{" "}
          {tablePeriod.to}
        </Note>
        <Note>
          {group === "sku" ? copy.sku : copy.ranking} ·{" "}
          {metric === "gmPct" ? copy.marginBasis : copy.heat}
        </Note>
        <Note>* {copy.partial}</Note>
      </div>
      <SalesMatrix
        rows={matrix.rows}
        total={matrix.total}
        metric={metric}
        group={group}
        copy={copy}
        locale={locale}
        href={href}
      />
      {group === "sku" ? (
        <Pager
          pagination={matrix.pagination}
          control="page"
          href={href}
          copy={copy}
        />
      ) : hasOthers ? (
        <div className="p-3 border-t border-(--border)">
          <Link
            className={button}
            href={href({
              others: showOthers ? null : "1",
              page: null,
            })}
          >
            {showOthers ? copy.hideOthers : copy.showOthers}
          </Link>
        </div>
      ) : null}
      {group !== "sku" &&
      showOthers &&
      hasOthers ? (
        <div className="border-t border-(--border)">
          <Heading as="h4" variant="compact" className="p-4 text-inherit">{copy.others}</Heading>
          <SalesMatrix
            rows={matrix.otherRows}
            metric={metric}
            group={group}
            copy={copy}
            locale={locale}
            href={href}
          />
          <Pager
            pagination={matrix.pagination}
            control="page"
            href={href}
            copy={copy}
          />
        </div>
      ) : null}
    </section>
  );
}
