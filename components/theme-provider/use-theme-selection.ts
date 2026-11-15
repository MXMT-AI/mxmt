"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import type { ThemeChoice } from "./theme-options";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useThemeSelection() {
  const { theme, resolvedTheme, forcedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const canChangeTheme = mounted && !forcedTheme;

  function selectTheme(value: ThemeChoice) {
    if (canChangeTheme) setTheme(value);
  }

  return {
    mounted,
    canChangeTheme,
    selectedTheme: mounted ? (forcedTheme ?? theme ?? "system") : undefined,
    resolvedTheme,
    selectTheme,
  };
}
