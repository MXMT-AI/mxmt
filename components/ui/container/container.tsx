import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-[min(100%_-_80px,1320px)] max-[1190px]:w-[calc(100%_-_48px)] max-[640px]:w-[calc(100%_-_36px)]", className)}
      {...props}
    />
  );
}
