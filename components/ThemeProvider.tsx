"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

interface ThemeContext { theme: Theme; toggle: () => void }

const Ctx = createContext<ThemeContext>({ theme: "dark", toggle: () => {} });

const LS_KEY = "mxmt_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(LS_KEY) as Theme | null) ?? "dark";
    setTheme(stored);
    document.documentElement.classList.toggle("light", stored === "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(LS_KEY, next);
      document.documentElement.classList.toggle("light", next === "light");
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all text-xs font-mono ${
        isLight
          ? "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#b45309] hover:bg-[#fbbf24]/20"
          : "bg-[var(--input-bg)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--input-hover)] hover:text-[var(--text)]"
      } ${className}`}
      title={isLight ? "Switch to dark" : "Switch to light"}
    >
      {isLight ? <Moon size={12} /> : <Sun size={12} />}
      {isLight ? "Dark" : "Light"}
    </button>
  );
}
