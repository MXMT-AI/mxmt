"use client";
import ReportingSourceStatus from "@/components/merchandising/reporting-source-status/reporting-source-status";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Button } from "@/components/ui/button/button";
import type { DataTableKey, InitialTablePreference } from "@/lib/data-table-preferences";
import { dataReportingDataReportingHubMessages as englishCopy } from "@/messages/en.json";
import { dataReportingDataReportingHubMessages as ukrainianCopy } from "@/messages/uk.json";
const DataReportingWorkspace = dynamic(
  () => import("../data-reporting-workspace/data-reporting-workspace"),
);
const SalesReportingWorkspace = dynamic(
  () => import("../sales-reporting-workspace/sales-reporting-workspace"),
);
export default function DataReportingHub(props: {
  userRole: string;
  initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>;
}) {
  const { lang } = useLang();
  const sales = useSearchParams().get("provider") === "salesdrive";
  const choose = (value: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.set("provider", value ? "salesdrive" : "sheets");
    window.history.replaceState(null, "", url);
  };
  return (
    <>
      <nav
        aria-label={lang === "uk" ? ukrainianCopy.ariaLabelDataView : englishCopy.ariaLabelDataView}
        className="px-5 md:px-8 pt-5 flex flex-wrap gap-2"
      >
        {[
          { value: false, label: englishCopy.labelGoogleSheets },
          { value: true, label: englishCopy.labelSalesDrive },
        ].map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="report"
            aria-pressed={sales === item.value}
            onClick={() => choose(item.value)}
            className="bg-(--surface) px-3 font-sans text-(--text) aria-pressed:border-(--text) aria-pressed:font-semibold"
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="px-5 md:px-8 pt-5"><ReportingSourceStatus explainTabs/></div>
      {sales ? (
        <SalesReportingWorkspace />
      ) : (
        <DataReportingWorkspace {...props} />
      )}
    </>
  );
}
