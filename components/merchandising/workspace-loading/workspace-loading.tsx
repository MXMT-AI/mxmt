import type { ComponentProps } from "react";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";

export function WorkspaceLoading({ title, message, messageClassName, ...props }: Omit<ComponentProps<"div">, "children"> & {
  title: string;
  message: string;
  messageClassName?: string;
}) {
  return (
    <div role="status" {...props}>
      <Heading as="h1" variant="page" className="text-2xl tracking-normal text-inherit">{title}</Heading>
      <Text variant="body" className={cn("mt-3 leading-normal text-(--muted)", messageClassName)}>{message}</Text>
    </div>
  );
}
