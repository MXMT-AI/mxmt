import { isValidElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import DocumentationPage, { generateMetadata } from "@/components/documentation/documentation-page/documentation-page";
import { useChangeLocale } from "@/components/language-provider/use-change-locale";
import { SkipLink } from "@/components/ui/skip-link/skip-link";
import { CsvGuide } from "@/components/documentation/csv-guide/csv-guide";
import { SheetsGuide } from "@/components/documentation/sheets-guide/sheets-guide";
import { docsCopy } from "@/components/documentation/documentation-page/copy";
import { getT } from "@/lib/translations";

const context = vi.hoisted(() => ({ locale: "uk" as "uk" | "en", replace: vi.fn() }));
vi.mock("next-intl", () => ({
  useLocale: () => context.locale,
  useMessages: () => getT(context.locale),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => context.locale,
  getTranslations: async () => (key: keyof ReturnType<typeof getT>) => getT(context.locale)[key],
}));
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  usePathname: () => "/docs",
  useRouter: () => ({ replace: context.replace }),
}));

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(["uk", "en"] as const)("preserves the selected tab, query and anchor when switching from %s", (locale) => {
  context.locale = locale;
  vi.stubGlobal("window", { location: { search: "?tab=google-sheets&extra=1", hash: "#sheets-mapping" } });
  const { changeLocale } = useChangeLocale();
  changeLocale(locale === "uk" ? "en" : "uk");
  expect(context.replace).toHaveBeenCalledWith("/docs?tab=google-sheets&extra=1#sheets-mapping", {
    locale: locale === "uk" ? "en" : "uk", scroll: false,
  });
});

it.each([
  { locale: "uk" as const, tab: undefined, guide: CsvGuide },
  { locale: "en" as const, tab: "google-sheets", guide: SheetsGuide },
])("renders the selected guide and a matching skip-link destination for $locale", async ({ locale, tab, guide }) => {
  context.locale = locale;
  const page = await DocumentationPage({ searchParams: Promise.resolve({ tab }) });
  const tree = nodes(page);
  expect(tree.some((node) => node.type === guide)).toBe(true);
  const main = tree.find((node) => node.type === "main")!;
  const skip = await SkipLink(tree.find((node) => node.type === SkipLink)!.props);
  expect(skip.props.href).toBe(`#${main.props.id}`);
  expect(main.props.tabIndex).toBe(-1);
  expect(await generateMetadata()).toEqual({
    title: `${docsCopy[locale].title} | MXMT Analytics`,
    description: docsCopy[locale].description,
  });
});
