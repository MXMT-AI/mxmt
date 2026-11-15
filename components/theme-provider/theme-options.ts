import { Monitor, Moon, Sun } from "lucide-react";

export const themeOptions = {
  system: { value: "system", icon: Monitor, label: "theme_system" },
  light: { value: "light", icon: Sun, label: "theme_light" },
  dark: { value: "dark", icon: Moon, label: "theme_dark" },
} as const;

export type ThemeChoice = keyof typeof themeOptions;
