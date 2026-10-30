import { getLocale } from "next-intl/server";
import { readSelectedSource } from "@/lib/connectors/source";
import ShopifyConnectionCard from "@/components/settings/ShopifyConnectionCard";
import HoroshopConnectionCard from "@/components/settings/HoroshopConnectionCard";
import KeyCrmConnectionCard from "@/components/settings/KeyCrmConnectionCard";
import CsvImportCard from "@/components/settings/CsvImportCard";
import SheetsMappingCard from "@/components/settings/SheetsMappingCard";
import ConnectorSourceCard from "@/components/settings/ConnectorSourceCard";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/translations";
import { getDriveMode } from "@/lib/gdrive";
import OnboardingForm from "@/components/settings/OnboardingForm";
import DriveSyncCard from "@/components/settings/DriveSyncCard";
import AIProviderCard from "@/components/settings/AIProviderCard";
import SettingsTabs from "@/components/settings/SettingsTabs";
import DataHealthSection from "@/components/settings/DataHealthSection";
import SalesDriveConnectionCard from "@/components/settings/SalesDriveConnectionCard";
import { requireCurrentUser } from "@/lib/server-auth";
import { getProviderConnection, getSalesDriveConnection } from "@/lib/connectors/service";

export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const tenantId = user.tenantId;
  const lang = await getLocale();
  const t = getT(lang);

  const [onboarding, driveSync, salesDrive, selectedSource, keyCrm, horoshop, shopify] = await Promise.all([
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
    prisma.googleDriveSync.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    getSalesDriveConnection(tenantId),
    readSelectedSource(tenantId, prisma),
    getProviderConnection(tenantId,"keycrm"),
    getProviderConnection(tenantId,"horoshop"),
    getProviderConnection(tenantId,"shopify"),
  ]);

  const generalContent = (
    <>
      {/* Onboarding section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-(--text) font-semibold">
              {lang === "uk" ? "Бриф онбордингу" : "Onboarding brief"}
            </h2>
            <p className="text-(--muted) text-sm">
              {lang === "uk" ? "Визначає логіку Агента Аналітика" : "Defines Analyst Agent logic"}
            </p>
          </div>
          {onboarding && (
            <span className="text-[10px] font-mono bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 px-2.5 py-1 rounded-lg">
              ✓ {lang === "uk" ? "Заповнено" : "Completed"}
            </span>
          )}
        </div>

        {onboarding && (
          <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-4">
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

      {/* Google Drive sync */}
      <ConnectorSourceCard lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />
      <SheetsMappingCard lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />
      <SalesDriveConnectionCard initial={salesDrive} lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <KeyCrmConnectionCard initial={keyCrm} lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <HoroshopConnectionCard initial={horoshop} lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <ShopifyConnectionCard initial={shopify} lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <CsvImportCard lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <DataHealthSection manualUpload={selectedSource?.provider === "csv"} lang={lang} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-(--text) font-semibold">
            {lang === "uk" ? "Google Drive синхронізація" : "Google Drive sync"}
          </h2>
          <p className="text-(--muted) text-sm">
            {lang === "uk" ? "Автоматичний імпорт даних з Excel файлу" : "Auto-import data from Excel file"}
          </p>
        </div>
        <DriveSyncCard lastSync={driveSync ?? null} lang={lang} driveMode={getDriveMode()} />
      </section>

      {/* AI Provider */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-(--text) font-semibold">
            {lang === "uk" ? "AI Модель (глобально)" : "AI Model (global)"}
          </h2>
          <p className="text-(--muted) text-sm">
            {lang === "uk" ? "Дефолтний провайдер якщо не вказано для агента" : "Default provider if not set per agent"}
          </p>
        </div>
        <AIProviderCard lang={lang} />
      </section>
    </>
  );

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--subtle) mb-2">
        {t.nav_settings}
      </div>
      <h1 className="text-2xl font-bold text-(--text) mb-1">
        {lang === "uk" ? "Налаштування" : "Settings"}
      </h1>
      <p className="text-(--muted) text-sm mb-8">
        {lang === "uk" ? "Онбординг, джерела даних, інтеграції" : "Onboarding, data sources, integrations"}
      </p>

      <SettingsTabs lang={lang} generalContent={generalContent} canManage={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />
    </div>
  );
}
