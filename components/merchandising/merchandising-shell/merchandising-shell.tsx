"use client";
import ReportingSourceStatus from "../reporting-source-status/reporting-source-status";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button/button";
import { AlertPanel } from "@/components/ui/alert-panel/alert-panel";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import { MerchandisingFiltersForm } from "../merchandising-filters-form/merchandising-filters-form";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import {
  readMerchandisingFilters,
  type MerchandisingFilters,
} from "@/lib/merchandising-navigation";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";

const Options = createContext<NavigationOptions | null>(null);
const ExportPermission = createContext(false);
export const useScenarioExportPermission = () => useContext(ExportPermission);
const Filters = createContext<MerchandisingFilters | null>(null);
export const useMerchandisingFilters = () => useContext(Filters);
export const useMerchandisingOptions = () => useContext(Options);

export default function MerchandisingShell({
  options,
  now,
  children,
  exportAllowed = false,
}: {
  exportAllowed?: boolean;
  options: NavigationOptions | null;
  now: string;
  children: ReactNode;
}) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const readingClock = new Date(
    Math.max(Date.parse(now), Date.parse(appliedAt ?? now)),
  );
  let filters: MerchandisingFilters | null = null;
  try {
    filters = readMerchandisingFilters(
      new URLSearchParams(params),
      readingClock,
    );
  } catch {
  }
  return (
    <ExportPermission.Provider value={exportAllowed}>
      <Options.Provider value={options}>
        <Filters.Provider value={filters}>
          <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
            {!options ? (
              <AlertPanel message={copy.error}>
                <Button
                  variant="report"
                  className="justify-start bg-(--surface) text-(--text)"
                  onClick={() => router.refresh()}
                >
                  {copy.retry}
                </Button>
              </AlertPanel>
            ) : !filters ? (
              <AlertPanel message={copy.invalidLink}>
                <Link className={cn(control, "inline-block w-auto min-w-auto touch-manipulation")} href={pathname}>
                  {copy.reset}
                </Link>
              </AlertPanel>
            ) : (
              <>
                <MerchandisingFiltersForm
                  key={params.toString()}
                  filters={filters}
                  onApply={setAppliedAt}
                  options={options}
                />
                <ReportingSourceStatus compact/>
                {children}
              </>
            )}
          </div>
        </Filters.Provider>
      </Options.Provider>
    </ExportPermission.Provider>
  );
}
