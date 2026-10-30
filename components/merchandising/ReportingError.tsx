"use client";
import { Link } from "@/i18n/navigation";
import { reportingErrorHelp } from "@/lib/reporting-readiness-copy";
import { button, panel } from "./ReportPrimitives";
/** One recovery flow for all five screens, without exposing internal error strings. */
export default function ReportingError({
  code,
  lang,
  onRetry,
  title,
}: {
  code: string;
  lang: "uk" | "en";
  onRetry: () => void;
  title?: string;
}) {
  const help = reportingErrorHelp(code, lang);
  return (
    <section role="alert" className={panel + " space-y-3 p-5"}>
      {title ? <h1 className="text-2xl font-bold">{title}</h1> : null}
      <p className="max-w-prose">{help.message}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={button} onClick={onRetry}>
          {lang === "uk" ? "Повторити" : "Retry"}
        </button>
        <Link className={button} href={help.href}>
          {help.action}
        </Link>
      </div>
    </section>
  );
}
