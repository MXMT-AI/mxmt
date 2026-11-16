import type { ReactNode } from "react";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";

export function OnboardingQuestion({ num, label, hint, children }: {
  num: string; label: string; hint?: string; children: ReactNode;
}) {
  return (
    <div className="border-b border-(--border) py-4 last:border-0">
      <div className="flex gap-3">
        <span className="w-6 shrink-0 pt-1 font-mono text-[10px] text-(--subtle)">{num}</span>
        <div className="min-w-0 flex-1">
          <Text variant="body" className="font-medium leading-normal text-(--text)">{label}</Text>
          {hint && <Note className="mt-0.5 font-mono text-[11px] leading-normal text-(--subtle)">{hint}</Note>}
          {children}
        </div>
      </div>
    </div>
  );
}
