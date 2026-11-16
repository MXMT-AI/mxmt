import { Badge } from "@/components/ui/badge/badge";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { SectionHeader } from "@/components/ui/section-header/section-header";
import { panel } from "@/components/ui/panel/panel-styles";
import { getLocale } from "next-intl/server";
import { readSelectedSource } from "@/lib/connectors/source";
import ShopifyConnectionCard from "@/components/settings/shopify-connection-card/shopify-connection-card";
import HoroshopConnectionCard from "@/components/settings/horoshop-connection-card/horoshop-connection-card";
import KeyCrmConnectionCard from "@/components/settings/key-crm-connection-card/key-crm-connection-card";
import CsvImportCard from "@/components/settings/csv-import-card/csv-import-card";
import SheetsMappingCard from "@/components/settings/sheets-mapping-card/sheets-mapping-card";
import ConnectorSourceCard from "@/components/settings/connector-source-card/connector-source-card";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/translations";
import { getDriveMode } from "@/lib/gdrive";
import { readDriveConnection } from "@/lib/drive-connection";
import SheetsConnectionCard from "@/components/settings/sheets-connection-card/sheets-connection-card";
import OnboardingForm from "@/components/settings/onboarding-form/onboarding-form";
import DriveSyncCard from "@/components/settings/drive-sync-card/drive-sync-card";
import AIProviderCard from "@/components/settings/ai-provider-card/ai-provider-card";
import SettingsTabs from "@/components/settings/settings-tabs/settings-tabs";
import DataHealthSection from "@/components/settings/data-health-section/data-health-section";
import SalesDriveConnectionCard from "@/components/settings/sales-drive-connection-card/sales-drive-connection-card";
import { requireCurrentUser } from "@/lib/server-auth";
import { getProviderConnection, getSalesDriveConnection } from "@/lib/connectors/service";

export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const tenantId = user.tenantId;
  const canManage = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const lang = await getLocale();
  const t = getT(lang);

  const [onboarding, driveSync, salesDrive, selectedSource, keyCrm, horoshop, shopify, sheetsConnection] = await Promise.all([
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
    prisma.googleDriveSync.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    getSalesDriveConnection(tenantId),
    readSelectedSource(tenantId, prisma),
    getProviderConnection(tenantId,"keycrm"),
    getProviderConnection(tenantId,"horoshop"),
    getProviderConnection(tenantId,"shopify"),
    readDriveConnection(tenantId),
  ]);

  const generalContent = (
    <>
      <section className="mb-10">
        <SectionHeader
          title={lang === "uk" ? "Бриф онбордингу" : "Onboarding brief"}
          description={lang === "uk" ? "Визначає логіку Агента Аналітика" : "Defines Analyst Agent logic"}
          action={onboarding && <Badge tone="positive" className="rounded-lg px-2.5 py-1">✓ {lang === "uk" ? "Заповнено" : "Completed"}</Badge>}
        />

        {onboarding && (
          <div className={panel + " p-5 mb-4"}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-1">
                  {lang === "uk" ? "Бізнес-модель" : "Business model"}
                </div>
                <div className="text-(--text) font-semibold">{onboarding.businessModel}</div>
              </div>
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-1">
                  {lang === "uk" ? "Заповнено" : "Completed"}
                </div>
                <div className="text-(--muted) text-sm">
                  {new Date(onboarding.completedAt).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-GB")}
                </div>
              </div>
            </div>
          </div>
        )}

        <OnboardingForm
          existing={
            onboarding
              ? { businessModel: onboarding.businessModel, answers: onboarding.answers as Record<string, unknown> }
              : null
          }
        />
      </section>

      <ConnectorSourceCard lang={lang} canManage={canManage} />
      <SheetsConnectionCard initial={sheetsConnection} lang={lang} canManage={canManage} />
      <SheetsMappingCard lang={lang} canManage={canManage} />
      <SalesDriveConnectionCard initial={salesDrive} lang={lang} canManage={canManage} />

      <KeyCrmConnectionCard initial={keyCrm} lang={lang} canManage={canManage} />

      <HoroshopConnectionCard initial={horoshop} lang={lang} canManage={canManage} />

      <ShopifyConnectionCard initial={shopify} lang={lang} canManage={canManage} />

      <CsvImportCard lang={lang} canManage={canManage} />

      <DataHealthSection manualUpload={selectedSource?.provider === "csv"} lang={lang} canManage={canManage} />

      <section className="mb-10">
        <SectionHeader
          title={lang === "uk" ? "Google Drive синхронізація" : "Google Drive sync"}
          description={lang === "uk" ? "Автоматичний імпорт даних з Excel файлу" : "Auto-import data from Excel file"}
        />
        <DriveSyncCard lastSync={driveSync?.driveFileId === sheetsConnection?.fileId ? driveSync : null} lang={lang} driveMode={getDriveMode(sheetsConnection?.fileId ?? null)} />
      </section>

      <section className="mb-10">
        <SectionHeader
          title={lang === "uk" ? "AI Модель (глобально)" : "AI Model (global)"}
          description={lang === "uk" ? "Дефолтний провайдер якщо не вказано для агента" : "Default provider if not set per agent"}
        />
        <AIProviderCard lang={lang} />
      </section>
    </>
  );

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--subtle) mb-2">
        {t.nav_settings}
      </div>
      <Heading as="h1" variant="page" className="mb-1 text-2xl tracking-normal">
        {lang === "uk" ? "Налаштування" : "Settings"}
      </Heading>
      <Text variant="body" className="mb-8 leading-normal text-(--muted)">
        {lang === "uk" ? "Онбординг, джерела даних, інтеграції" : "Onboarding, data sources, integrations"}
      </Text>

      <SettingsTabs lang={lang} generalContent={generalContent} canManage={canManage} />
    </div>
  );
}
