"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { faviconImages } from "@/lib/brand-images";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      storageKey="mxmt_theme"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      <ThemeFavicon />
      {children}
    </NextThemesProvider>
  );
}

function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && (resolvedTheme === "light" || resolvedTheme === "dark")) {
    return <link key={resolvedTheme} rel="icon" type="image/png" sizes="32x32" href={faviconImages[resolvedTheme].src} />;
  }

  return (
    <>
      <link rel="icon" type="image/png" sizes="32x32" href={faviconImages.dark.src} media="(prefers-color-scheme: dark)" />
      <link rel="icon" type="image/png" sizes="32x32" href={faviconImages.light.src} media="(prefers-color-scheme: light)" />
    </>
  );
}
