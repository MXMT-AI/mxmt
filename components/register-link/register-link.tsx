import { ArrowRight } from "lucide-react";
import { ActionLink } from "@/components/ui/action-link/action-link";

export function RegisterLink({ label, withArrow = false }: {
  label: string;
  withArrow?: boolean;
}) {
  return (
    <ActionLink href="/register">
      {label}
      {withArrow && <ArrowRight size={17} aria-hidden="true" />}
    </ActionLink>
  );
}
