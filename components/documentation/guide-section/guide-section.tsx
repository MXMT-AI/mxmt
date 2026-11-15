import type { ReactNode } from "react";
import { Heading } from "@/components/ui/heading/heading";

export function GuideSection({ id, title, children }: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-(--border) py-8 sm:py-10">
      <Heading as="h2" variant="page" className="mb-4 text-2xl font-semibold tracking-tight">{title}</Heading>
      {children}
    </section>
  );
}
