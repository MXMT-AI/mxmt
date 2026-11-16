import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";

const statuses = {
  pending: { Icon: Clock, className: "text-(--subtle)", uk: "Не синхронізовано", en: "Not synced" },
  success: { Icon: CheckCircle2, className: "text-[#86efac]", uk: "Синхронізовано успішно", en: "Synced successfully" },
  error: { Icon: AlertCircle, className: "text-[#fca5a5]", uk: "Помилка синхронізації", en: "Sync failed" },
  running: { Icon: RefreshCw, className: "text-accent-yellow animate-spin", uk: "Синхронізація…", en: "Syncing…" },
};

export function driveSyncStatus(status: string) {
  return Object.hasOwn(statuses, status) ? statuses[status as keyof typeof statuses] : statuses.running;
}
