import { Button } from "@/components/ui/button/button";
import { ReportHeader } from "@/components/merchandising/report-header/report-header";
import type { SalesCopy } from "@/lib/sales-copy";

export function SalesHeader({ period, createdAt, copy, locale, onRefresh }: {
  period: { from: string; to: string };
  createdAt: string;
  copy: Pick<SalesCopy, "title" | "scope" | "snapshot" | "refresh">;
  locale: string;
  onRefresh?: () => void;
}) {
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kyiv",
  }).format(new Date(createdAt));

  return (
    <ReportHeader
      title={copy.title}
      description={<>{copy.scope}: {period.from} — {period.to}</>}
      metadata={<>{copy.snapshot}: {timestamp}</>}
      action={onRefresh && <Button variant="report" onClick={onRefresh}>{copy.refresh}</Button>}
    />
  );
}
