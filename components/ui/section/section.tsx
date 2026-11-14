import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "../container/container";

type SectionProps = ComponentProps<"section"> & {
  background?: ReactNode;
  contentClassName?: string;
  padded?: boolean;
};

export function Section({ background, children, contentClassName, padded = true, ...props }: SectionProps) {
  return (
    <section {...props}>
      {background}
      <Container className={cn(padded && "py-[clamp(55px,8vw,112px)]", contentClassName)}>
        {children}
      </Container>
    </section>
  );
}
