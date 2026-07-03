"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { type Lang, type Translations, getT } from "@/lib/translations";

interface LangContext {
  lang: Lang;
  t: Translations;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangContext>({
  lang: "uk",
  t: getT("uk"),
  setLang: () => {},
});

const COOKIE_NAME = "lang";
const LS_KEY = "mxmt_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uk");

  // Initialise from localStorage on first mount
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY) as Lang | null;
    if (stored === "uk" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
    // Also set cookie so server components can read it
    document.cookie = `${COOKIE_NAME}=${l};path=/;max-age=31536000;samesite=lax`;
  }, []);

  return (
    <Ctx.Provider value={{ lang, t: getT(lang), setLang }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang() {
  return useContext(Ctx);
}

// Small toggle component — drop it anywhere
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === "uk" ? "en" : "uk")}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] hover:bg-[var(--input-hover)] transition-colors text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] ${className}`}
      title={lang === "uk" ? "Switch to English" : "Перемкнути на українську"}
    >
      {lang === "uk" ? "🇺🇦 UA" : "🇬🇧 EN"}
    </button>
  );
}
