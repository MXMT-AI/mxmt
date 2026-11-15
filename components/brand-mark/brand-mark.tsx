import { brandImages } from "@/lib/brand-images";
import { cn } from "@/lib/utils";

const brandSources = {
  "--brand-light": `url("${brandImages.light.src}")`,
  "--brand-dark": `url("${brandImages.dark.src}")`,
};

export function BrandMark({ size = 32, transparent = false }: { size?: number; transparent?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block flex-none rounded-[6px] bg-size-[138%] bg-center bg-no-repeat [background-image:var(--brand-dark)] theme-light:[background-image:var(--brand-light)]",
        transparent ? "bg-transparent" : "bg-(--bg-dark) theme-light:bg-(--bg-light)",
      )}
      style={{ ...brandSources, width: size, height: size }}
    />
  );
}
