"use client";

import { Link } from "@/i18n/navigation";
import { reportingErrorHelp } from "@/lib/reporting-readiness-copy";
import type { Lang } from "@/lib/translations";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { button } from "@/components/ui/button/button-styles";
import { panel } from "@/components/ui/panel/panel-styles";
import { merchandisingReportingErrorMessages as englishCopy } from "@/messages/en.json";
import { merchandisingReportingErrorMessages as ukrainianCopy } from "@/messages/uk.json";

export default function ReportingError({
  code,
  lang,
  onRetry,
  title,
}: {
  code: string;
  lang: Lang;
  onRetry: () => void;
  title?: string;
}) {
  const help = reportingErrorHelp(code, lang);
  return (
    <section role="alert" className={panel + " space-y-3 p-5"}>
      {title ? <Heading as="h1" variant="page" className="text-2xl tracking-normal text-inherit">{title}</Heading> : null}
      <p className="max-w-prose">{help.message}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="report" onClick={onRetry}>
          {lang === "uk" ? ukrainianCopy.retry : englishCopy.retry}
        </Button>
        <Link className={button} href={help.href}>
          {help.action}
        </Link>
      </div>
    </section>
  );
}
