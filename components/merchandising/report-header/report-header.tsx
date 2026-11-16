import type { ReactNode } from "react";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";

export function ReportHeader({ title, description, metadata, action }: {
  title: string;
  description: ReactNode;
  metadata: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Heading as="h1" variant="page" className="text-2xl text-inherit">{title}</Heading>
        <Text variant="body" className="mt-2 leading-normal text-(--muted)">{description}</Text>
        <Text variant="body" className="mt-1 break-all text-xs leading-normal text-(--muted)">{metadata}</Text>
      </div>
      {action}
    </header>
  );
}
