import { cn } from "@/lib/utils";
import { panel } from "../panel/panel-styles";

export function Toast({ message }: { message: string | null }) {
  return (
    <div role="status" aria-atomic="true" className="fixed bottom-5 right-5 z-50">
      {message ? (
        <div className={cn(panel, "border-accent-cyan/30 text-accent-cyan text-sm font-medium px-4 py-2.5 shadow-xl")}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
