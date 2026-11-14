import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Actions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-7 flex flex-wrap gap-3 max-[640px]:mt-[22px]", className)} {...props} />;
}
