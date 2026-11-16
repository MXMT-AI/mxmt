import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";

export const inputClass = cn(control, "mt-1 block min-h-0 focus-visible:outline-(--text)");
export const buttonClass =
  "min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)";
