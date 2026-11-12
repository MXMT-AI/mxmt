import type { CSSProperties } from "react";
import { brandImages } from "@/lib/brand-images";

export function BrandMark({ size = 32, transparent = false }: { size?: number; transparent?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="brand-mark"
      data-transparent={transparent || undefined}
      style={{
        width: size,
        height: size,
        "--brand-light": `url("${brandImages.light.src}")`,
        "--brand-dark": `url("${brandImages.dark.src}")`,
      } as CSSProperties}
    />
  );
}
