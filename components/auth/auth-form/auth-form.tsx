import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button/button";
import { panel } from "@/components/ui/panel/panel-styles";
import { cn } from "@/lib/utils";
import { AuthFormError } from "../auth-form-error/auth-form-error";

type AuthFormProps = ComponentProps<"form"> & {
  error: string;
  loading: boolean;
  submitLabel: string;
  pendingLabel: string;
  panelClassName?: string;
};

export function AuthForm({ error, loading, submitLabel, pendingLabel, panelClassName, className, children, ...props }: AuthFormProps) {
  return (
    <div className={cn(panel, "rounded-2xl p-7", panelClassName)}>
      <form {...props} aria-busy={loading} className={cn("space-y-4", className)}>
        {children}
        <AuthFormError message={error} />
        <Button variant="accent" type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? pendingLabel : submitLabel}
        </Button>
      </form>
    </div>
  );
}
