import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { panel } from "@/components/ui/panel/panel-styles";

export function OverviewMetric({
  metric,
  title,
  href,
  children,
  footer,
}: {
  metric: "sales" | "margin" | "stock";
  title: string;
  href: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article data-metric={metric} className={panel + " overview-metric min-w-0"}>
      <Link
        href={href}
        className="block rounded-xl p-5 md:p-6 hover:bg-(--input-bg)"
      >
        <div className="mb-4 flex justify-between items-baseline gap-3">
          <h3 className="font-semibold">{title}</h3>
          <span className="text-(--signal-ink)" aria-hidden="true">↗</span>
        </div>
        {children}
      </Link>
      {footer ? (
        <div className="border-t border-(--border) px-5 py-3 text-xs md:px-6">
          {footer}
        </div>
      ) : null}
    </article>
  );
}
