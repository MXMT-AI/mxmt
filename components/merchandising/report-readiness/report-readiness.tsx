import { Heading } from "@/components/ui/heading/heading";
import { Link } from "@/i18n/navigation";
import type { Lang } from "@/lib/translations";
import type { readReportReadiness } from "@/lib/report-readiness";
import { panel } from "@/components/ui/panel/panel-styles";
import { reportReadinessCopy } from "./copy";

const reasonKeys = ["missingStock", "missingReceipt", "missingVelocity", "unknownOwnership", "unknownKind"] as const;
const correctionLinks = [
  { href: "/settings?tab=general#data-quality-title", label: "qualityLink" },
  { href: "/settings?tab=merchandising", label: "settingsLink" },
] as const;

export default function ReportReadiness({ data, lang }: {
  data: Awaited<ReturnType<typeof readReportReadiness>>;
  lang: Lang;
}) {
  const copy = reportReadinessCopy[lang];
  const visibleReasons = reasonKeys.filter(key => data[key] > 0);
  if (data.unclassified === 0 && !visibleReasons.length) return null;
  const number = new Intl.NumberFormat(lang === "uk" ? "uk-UA" : "en-GB");

  return (
    <aside className={panel + " p-4 space-y-3"} aria-label={copy.ariaLabel}>
      <Heading as="h2" variant="compact" className="text-base text-inherit">{copy.heading}</Heading>
      <p className="text-xs text-(--muted)">{copy.scope}</p>
      {visibleReasons.length ? (
        <ul className="list-disc pl-5 space-y-2 text-sm">
          {visibleReasons.map(key => (
            <li key={key}><strong className="tabular-nums">{number.format(data[key])}</strong> {copy[key]}</li>
          ))}
        </ul>
      ) : null}
      {data.unclassified > 0 ? <p className="text-sm">{copy.classificationWarning}</p> : null}
      <div className="flex flex-wrap gap-4 text-sm">
        {correctionLinks.map(({ href, label }) => (
          <Link key={href} className="underline underline-offset-4 focus-visible:outline-2" href={href}>{copy[label]}</Link>
        ))}
      </div>
    </aside>
  );
}
