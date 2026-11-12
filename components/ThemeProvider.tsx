"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
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

export function ThemeToggle({
  className = "",
  placement = "below",
}: {
  className?: string;
  placement?: "below" | "above" | "inline";
}) {
  const { theme, resolvedTheme, setTheme, forcedTheme } = useTheme();
  const { t } = useLang();
  const id = useId();
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: t.theme_light, icon: Sun },
    { value: "dark", label: t.theme_dark, icon: Moon },
    { value: "system", label: t.theme_system, icon: Monitor },
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === (forcedTheme ?? theme ?? "system")));
  const selected = options[selectedIndex];
  const Icon = mounted ? selected.icon : Monitor;
  const actualTheme = resolvedTheme === "light" ? t.theme_light : t.theme_dark;
  const open = activeIndex !== null;
  const listPosition = {
    below: "absolute inset-x-0 top-full z-20",
    above: "absolute inset-x-0 bottom-full z-20 mb-1.5",
    inline: "",
  }[placement];

  function choose(index: number) {
    setTheme(options[index].value);
    setActiveIndex(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(null);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(open ? Math.max(0, Math.min(options.length - 1, activeIndex + step)) : selectedIndex);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    }
  }

  return (
    <div className={`relative w-36 shrink-0 ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-label={t.theme_label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
        disabled={!mounted || Boolean(forcedTheme)}
        title={mounted ? `${t.theme_label}: ${actualTheme}` : t.theme_label}
        onClick={() => setActiveIndex(open ? null : selectedIndex)}
        onKeyDown={handleKeyDown}
        onBlur={() => setActiveIndex(null)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-(--border) bg-(--input-bg) px-2.5 text-left text-xs text-(--text) hover:bg-(--input-hover) disabled:cursor-default disabled:opacity-60"
      >
        <Icon size={14} aria-hidden="true" className="shrink-0 text-(--muted)" />
        <span className="flex-1">{mounted ? selected.label : t.theme_label}</span>
        <ChevronDown size={12} aria-hidden="true" className={`shrink-0 text-(--muted) ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={t.theme_label}
          onMouseDown={(event) => event.preventDefault()}
          className={`mt-1.5 min-w-36 rounded-lg border border-(--border) bg-(--surface) p-1 text-(--text) shadow-lg ${listPosition}`}
        >
          {options.map(({ value, label, icon: OptionIcon }, index) => (
            <div
              key={value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => choose(index)}
              onPointerEnter={() => setActiveIndex(index)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs ${index === activeIndex ? "bg-(--nav-current) text-(--nav-ink)" : ""}`}
            >
              <OptionIcon size={14} aria-hidden="true" className="shrink-0" />
              <span className="flex-1">{label}</span>
              {index === selectedIndex && <Check size={14} aria-hidden="true" className="shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
