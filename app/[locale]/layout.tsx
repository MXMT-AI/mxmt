import type { Metadata } from "next";
import "../globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/routing";
import { ThemeProvider } from "@/components/theme-provider/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://mxmt.vercel.app"),
  title: "MXMT Analytics",
  description: "AI-powered retail analytics for fashion businesses",
  openGraph: {
    type: "website",
    siteName: "MXMT Analytics",
    images: [{
      url: "/og-preview.png",
      width: 1280,
      height: 640,
      alt: "MXMT Analytics — Retail analytics for fashion businesses",
    }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Kyiv">{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
