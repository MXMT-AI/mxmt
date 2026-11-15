"use client";
import ReportingSourceStatus from "@/components/merchandising/reporting-source-status/reporting-source-status";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Button } from "@/components/ui/button/button";
import DataReportingWorkspace from "../data-reporting-workspace/data-reporting-workspace";
import type { DataTableKey, InitialTablePreference } from "@/lib/data-table-preferences";
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
        aria-label={lang === "uk" ? "Перегляд даних" : "Data view"}
        className="px-5 md:px-8 pt-5 flex flex-wrap gap-2"
      >
        {[
          { value: false, label: "Google Sheets" },
          { value: true, label: "SalesDrive" },
        ].map((item) => (
          <Button
            key={item.label}
            type="button"
            aria-pressed={sales === item.value}
            onClick={() => choose(item.value)}
            className="touch-manipulation bg-(--surface) px-3 py-2 font-sans text-sm text-(--text) focus-visible:outline-solid focus-visible:outline-2 aria-pressed:border-(--text) aria-pressed:font-semibold"
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
