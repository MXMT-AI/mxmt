"use client";
import { faviconImages } from "@/lib/brand-images";
import { useThemeSelection } from "../theme-provider/use-theme-selection";

export function ThemeFavicon() {
  const { mounted, resolvedTheme } = useThemeSelection();
  const resolved = mounted && (resolvedTheme === "light" || resolvedTheme === "dark") ? resolvedTheme : null;
  const themes: ReadonlyArray<keyof typeof faviconImages> = resolved ? [resolved] : ["dark", "light"];
  return (
    <>
      {themes.map(theme => (
        <link
          key={theme}
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={faviconImages[theme].src}
          media={resolved ? undefined : `(prefers-color-scheme: ${theme})`}
        />
      ))}
    </>
  );
}
