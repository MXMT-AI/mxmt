import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import uk from "@/messages/uk.json";
import en from "@/messages/en.json";

export function renderToStaticMarkup(element: ReactNode): string {
  const props = (element as ReactElement<{ lang?: string }> | null)?.props;
  const locale = props?.lang === "en" ? "en" : "uk";
  return render(createElement(NextIntlClientProvider, {
    locale, messages: locale === "en" ? en : uk, timeZone: "Europe/Kyiv", children: element,
  }));
}
