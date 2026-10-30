"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";

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
      {children}
    </NextThemesProvider>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme, forcedTheme } = useTheme();
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The server cannot read browser preferences. Keep the first client render identical.
  const value = mounted ? theme ?? "system" : "";
  const Icon = !mounted || value === "system" ? Monitor : resolvedTheme === "light" ? Sun : Moon;
  const actualTheme = resolvedTheme === "light" ? t.theme_light : t.theme_dark;

  return (
    <label
      className={`relative inline-flex min-h-11 w-36 shrink-0 items-center rounded-lg border border-(--border) bg-(--input-bg) text-(--text) hover:bg-(--input-hover) ${className}`}
      title={mounted ? `${t.theme_label}: ${actualTheme}` : t.theme_label}
    >
      <Icon size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-(--muted)" />
      <span className="sr-only">{t.theme_label}</span>
      <select
        value={value}
        disabled={!mounted || Boolean(forcedTheme)}
        onChange={(event) => setTheme(event.target.value)}
        className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent bg-none pl-8 pr-7 text-xs disabled:cursor-default disabled:opacity-60"
      >
        <option value="" disabled hidden>{t.theme_label}</option>
        <option value="light">{t.theme_light}</option>
        <option value="dark">{t.theme_dark}</option>
        <option value="system">{t.theme_system}</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-2 text-(--muted)" />
    </label>
  );
}
