"use client";

import { useCallback, useState, useEffect } from "react";
import { Text } from "@/components/ui/text/text";
import type { Lang } from "@/lib/translations";
import DataQualityCard from "../data-quality-card/data-quality-card";
import SalesDriveImportCard from "../sales-drive-import-card/sales-drive-import-card";
import { settingsDataHealthSectionMessages as englishCopy } from "@/messages/en.json";
import { settingsDataHealthSectionMessages as ukrainianCopy } from "@/messages/uk.json";

const resources = ["sync", "inventory", "orders"] as const;

export default function DataHealthSection({ lang, canManage, manualUpload = false }: {
  lang: Lang;
  canManage: boolean;
  manualUpload?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const updated = useCallback(() => setRevision(revision => revision + 1), []);

  useEffect(() => {
    window.addEventListener("connector-inputs-changed", updated);
    return () => window.removeEventListener("connector-inputs-changed", updated);
  }, [updated]);

  return (
    <>
      <DataQualityCard lang={lang} canManage={canManage} revision={revision} />
      {manualUpload ? (
        <Text variant="body" className="mb-10 leading-normal text-(--muted)">
          {lang === "uk"
            ? ukrainianCopy.refreshCSVDataByPreviewing
            : englishCopy.refreshCSVDataByPreviewing}
        </Text>
      ) : resources.map(resource => (
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
