import { getTranslations } from "next-intl/server";

export const mainContentId = "main-content";

export async function SkipLink({ targetId = mainContentId }: { targetId?: string }) {
  const t = await getTranslations();

  return (
    <a
      href={`#${targetId}`}
      className="fixed start-4 top-4 z-[1000] -translate-y-[calc(100%+2rem)] rounded-lg border border-(--border) bg-[color:var(--ui-action-primary-bg,var(--action-bg))] px-3 py-2 text-xs font-bold text-[color:var(--ui-action-primary-ink,var(--action-ink))] focus-visible:translate-y-0"
    >
      {t("nav_skip_to_main")}
    </a>
  );
}
