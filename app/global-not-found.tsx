import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ProblemScreen } from "@/components/ProblemScreen";
import { ThemeProvider } from "@/components/ThemeProvider";
import { isLocale, routing } from "@/i18n/routing";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 | MXMT Analytics",
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
