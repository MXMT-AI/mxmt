import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/translations";
import { getDriveMode } from "@/lib/gdrive";
import OnboardingForm from "@/components/settings/OnboardingForm";
import DriveSyncCard from "@/components/settings/DriveSyncCard";
import AIProviderCard from "@/components/settings/AIProviderCard";
import SettingsTabs from "@/components/settings/SettingsTabs";

export default async function SettingsPage() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value ?? "uk") as "uk" | "en";
  const t = getT(lang);

  const [onboarding, driveSync] = await Promise.all([
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
    prisma.googleDriveSync.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
  ]);

  const generalContent = (
    <>
      {/* Onboarding section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[var(--text)] font-semibold">
              {lang === "uk" ? "Бриф онбордингу" : "Onboarding brief"}
            </h2>
            <p className="text-[var(--muted)] text-sm">
              {lang === "uk" ? "Визначає логіку Агента Аналітика" : "Defines Analyst Agent logic"}
            </p>
          </div>
          {onboarding && (
            <span className="text-[10px] font-mono bg-[#00e5c4]/10 text-[#00e5c4] border border-[#00e5c4]/20 px-2.5 py-1 rounded-lg">
              ✓ {lang === "uk" ? "Заповнено" : "Completed"}
            </span>
          )}
        </div>

        {onboarding && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-1">
                  {lang === "uk" ? "Бізнес-модель" : "Business model"}
                </div>
                <div className="text-[var(--text)] font-semibold">{onboarding.businessModel}</div>
              </div>
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-1">
                  {lang === "uk" ? "Заповнено" : "Completed"}
                </div>
                <div className="text-[var(--muted)] text-sm">
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
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-[var(--text)] font-semibold">
            {lang === "uk" ? "Google Drive синхронізація" : "Google Drive sync"}
          </h2>
          <p className="text-[var(--muted)] text-sm">
            {lang === "uk" ? "Автоматичний імпорт даних з Excel файлу" : "Auto-import data from Excel file"}
          </p>
        </div>
        <DriveSyncCard lastSync={driveSync ?? null} lang={lang} driveMode={getDriveMode()} />
      </section>

      {/* AI Provider */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-[var(--text)] font-semibold">
            {lang === "uk" ? "AI Модель (глобально)" : "AI Model (global)"}
          </h2>
          <p className="text-[var(--muted)] text-sm">
            {lang === "uk" ? "Дефолтний провайдер якщо не вказано для агента" : "Default provider if not set per agent"}
          </p>
        </div>
        <AIProviderCard lang={lang} />
      </section>
    </>
  );

  return (
    <div className="p-8 max-w-3xl">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">
        {t.nav_settings}
      </div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-1">
        {lang === "uk" ? "Налаштування" : "Settings"}
      </h1>
      <p className="text-[var(--muted)] text-sm mb-8">
        {lang === "uk" ? "Онбординг, джерела даних, інтеграції" : "Onboarding, data sources, integrations"}
      </p>

      <SettingsTabs lang={lang} generalContent={generalContent} />
    </div>
  );
}
