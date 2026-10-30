"use client";
import { useCallback, useState, useEffect } from "react";
import DataQualityCard from "./DataQualityCard";
import SalesDriveImportCard from "./SalesDriveImportCard";
/** Import and calculation completion invalidate the existing diagnostics without duplicating sync controls. */
export default function DataHealthSection({
  lang,
  canManage,
  manualUpload=false,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  manualUpload?: boolean;
}) {
  const [revision, setRevision] = useState(0),
    updated = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(()=>{window.addEventListener("connector-inputs-changed",updated);return()=>window.removeEventListener("connector-inputs-changed",updated);},[updated]);
  return (
    <>
      <DataQualityCard lang={lang} canManage={canManage} revision={revision} />
      {manualUpload ? <p className="mb-10 text-sm text-(--muted)">{lang === "uk" ? "CSV оновлюється через перевірку та активацію нового пакета вище." : "Refresh CSV data by previewing and activating a new packet above."}</p> : (["sync", "inventory", "orders"] as const).map((resource) => (
        <SalesDriveImportCard
          key={resource}
          generic
          lang={lang}
          resource={resource}
          canManage={canManage}
          onCompleted={updated}
        />
      ))}
    </>
  );
}
