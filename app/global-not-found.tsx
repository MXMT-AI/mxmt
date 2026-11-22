import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ProblemScreen } from "@/components/problem-screen/problem-screen";
import { ThemeProvider } from "@/components/theme-provider/theme-provider";
import { isLocale, routing } from "@/i18n/routing";
import "./globals.css";
import { globalNotFoundMessages as englishCopy } from "@/messages/en.json";

export const metadata: Metadata = {
  title: englishCopy.title404MXMTAnalytics,
  robots: { index: false },
};

export default async function GlobalNotFound() {
  const saved = (await cookies()).get("lang")?.value;
  const locale = isLocale(saved) ? saved : routing.defaultLocale;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider><ProblemScreen code="404" locale={locale} /></ThemeProvider>
      </body>
    </html>
  );
}
