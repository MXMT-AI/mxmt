import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Heading } from "../heading/heading";
import { Text } from "../text/text";

export function SectionHeader({ title, description, action, className, ...props }: Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("mb-4", action && "flex items-center justify-between gap-3", className)} {...props}>
      <div className="min-w-0">
        <Heading as="h2" variant="compact" className="text-base">{title}</Heading>
        <Text variant="body" className="leading-normal text-(--muted)">{description}</Text>
      </div>
      {action}
    </div>
  );
}
