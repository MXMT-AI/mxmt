import { AlertPanel } from "@/components/ui/alert-panel/alert-panel";
import { Button } from "@/components/ui/button/button";

export function ScenarioPreviewError({ message, copy, onRetry, onRefresh }: {
  message: string;
  copy: { retry: string; refresh: string };
  onRetry: () => void;
  onRefresh: () => void;
}) {
  return (
    <AlertPanel className="bg-transparent p-4" message={message}>
      <div className="flex flex-wrap gap-2">
        <Button variant="report" onClick={onRetry}>{copy.retry}</Button>
        <Button variant="report" onClick={onRefresh}>{copy.refresh}</Button>
      </div>
    </AlertPanel>
  );
}
