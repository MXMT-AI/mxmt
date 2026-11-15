import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const gutters = {
  responsive: "w-[min(100%_-_80px,1320px)] max-[1190px]:w-[calc(100%_-_48px)] max-[640px]:w-[calc(100%_-_36px)]",
  fixed: "w-[min(100%_-_40px,1320px)]",
};

type ContainerProps = ComponentProps<"div"> & { gutter?: keyof typeof gutters };

export function Container({ className, gutter = "responsive", ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto", gutters[gutter], className)}
      {...props}
    />
  );
}
