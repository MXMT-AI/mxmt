import type { ReactNode } from "react";
import { Field } from "@/components/ui/field/field";
import { Text } from "@/components/ui/text/text";

export function MerchandisingField({ name, label, error, children }: {
  name: string; label: string; error?: string; children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Field label={label} className="gap-0 text-sm">
        {children}
      </Field>
      {error && <Text variant="body" id={`merch-error-${name}`} className="mt-1 leading-normal text-red-500">{error}</Text>}
    </div>
  );
}
