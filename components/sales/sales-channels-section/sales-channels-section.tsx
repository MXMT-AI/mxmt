import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import { Pager } from "@/components/ui/pager/pager";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesCurrencyBlock, SalesHref } from "../sales-types";

type SalesChannelRow = SalesCurrencyBlock["channels"]["rows"][number];

export function SalesChannelsSection({ channels, copy, locale, href }: {
  channels: SalesCurrencyBlock["channels"];
  copy: SalesCopy;
  locale: string;
  href: SalesHref;
}) {
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">S2 · {copy.channels}</Heading>
        <Note>{copy.channelScope}</Note>
      </div>
      <ReportTable
        locale={locale}
        columns={[
          { key: "name", label: copy.name, type: "text" },
          { key: "revenue", label: copy.revenue, type: "money" },
          { key: "share", label: copy.share, type: "percentage" },
        ]}
        rows={channels.rows.map((r) => ({
          ...r,
          id: r.id ?? "__unassigned__",
          revenue: r.total.value,
          source: r,
        }))}
        renderCell={(row, col) =>
          col.key === "name" ? (
            <Link
              className="underline underline-offset-4"
              href={href({
                channelId:
                  (row.source as SalesChannelRow).id ?? "__unassigned__",
                page: null,
                channelPage: null,
                others: null,
              })}
            >
              {(row.source as SalesChannelRow).id === null
                ? copy.unassigned
                : String(row.name)}
            </Link>
          ) : (
            <span
              title={
                (row.source as SalesChannelRow).total.partial
                  ? copy.partial
                  : undefined
              }
            >
              {formatTableValue(row[col.key], col.type, locale)}
              {col.key === "revenue" &&
              (row.source as SalesChannelRow).total.partial ? (
                <PartialMarker label={copy.partial} />
              ) : null}
            </span>
          )
        }
      />
      {!channels.rows.length ? (
        <p className="p-5 text-sm text-(--muted)">
          {copy.noRows}
        </p>
      ) : null}
      <Pager
        pagination={channels.pagination}
        control="channelPage"
        href={href}
        copy={copy}
      />
    </section>
  );
}
