"use client";
import ReportingSourceStatus from "@/components/merchandising/ReportingSourceStatus";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLang } from "@/components/LanguageProvider";
import DataReportingWorkspace, {
  type InitialTablePreference,
} from "./DataReportingWorkspace";
import type { DataTableKey } from "@/lib/data-table-api";
const SalesReportingWorkspace = dynamic(
  () => import("./SalesReportingWorkspace"),
);
/** Explicit source selection preserves the approved legacy reporting contract. */
export default function DataReportingHub(props: {
  userRole: string;
  initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>;
}) {
  const { lang } = useLang();
  const [sales, setSales] = useState(false);
  useEffect(() => {
    const read = () =>
      setSales(
        new URLSearchParams(location.search).get("provider") === "salesdrive",
      );
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const choose = (value: boolean) => {
    setSales(value);
    const url = new URL(location.href);
    url.searchParams.set("provider", value ? "salesdrive" : "sheets");
    history.replaceState(null, "", url);
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
          <button
            key={item.label}
            type="button"
            aria-pressed={sales === item.value}
            onClick={() => choose(item.value)}
            className="rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) hover:bg-(--input-bg) focus-visible:outline-solid focus-visible:outline-2 touch-manipulation aria-pressed:border-(--text) aria-pressed:font-semibold"
          >
            {item.label}
          </button>
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
