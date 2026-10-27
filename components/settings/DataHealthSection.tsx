"use client";
import { useCallback, useState } from "react";
import DataQualityCard from "./DataQualityCard";
import SalesDriveImportCard from "./SalesDriveImportCard";
/** Import and calculation completion invalidate the existing diagnostics without duplicating sync controls. */
export default function DataHealthSection({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const [revision, setRevision] = useState(0),
    updated = useCallback(() => setRevision((n) => n + 1), []);
  return (
    <>
      <DataQualityCard lang={lang} canManage={canManage} revision={revision} />
      {(["sync", "inventory", "orders"] as const).map((resource) => (
        <SalesDriveImportCard
          key={resource}
          lang={lang}
          resource={resource}
          canManage={canManage}
          onCompleted={updated}
        />
      ))}
    </>
  );
}
