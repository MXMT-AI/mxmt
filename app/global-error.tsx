"use client";

import { usePathname } from "next/navigation";
import { ProblemScreen } from "@/components/problem-screen/problem-screen";
import { ThemeProvider } from "@/components/theme-provider/theme-provider";
import { localeFromPath, routing } from "@/i18n/routing";
import "./globals.css";
import { globalErrorMessages as englishCopy } from "@/messages/en.json";

export default function GlobalError({ retry }: { retry: () => void }) {
  const locale = localeFromPath(usePathname() ?? "/") ?? routing.defaultLocale;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <title>{englishCopy["500MXMTAnalytics"]}</title>
        <ThemeProvider><ProblemScreen code="500" locale={locale} retry={retry} /></ThemeProvider>
      </body>
    </html>
  );
}
