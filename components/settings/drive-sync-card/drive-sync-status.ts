import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { settingsDriveSyncCardDriveSyncStatusMessages as englishCopy } from "@/messages/en.json";
import { settingsDriveSyncCardDriveSyncStatusMessages as ukrainianCopy } from "@/messages/uk.json";

const statuses = {
  pending: { Icon: Clock, className: "text-(--subtle)", uk: ukrainianCopy.enNotSynced, en: englishCopy.enNotSynced },
  success: { Icon: CheckCircle2, className: "text-[#86efac]", uk: ukrainianCopy.enSyncedSuccessfully, en: englishCopy.enSyncedSuccessfully },
  error: { Icon: AlertCircle, className: "text-[#fca5a5]", uk: ukrainianCopy.enSyncFailed, en: englishCopy.enSyncFailed },
  running: { Icon: RefreshCw, className: "text-accent-yellow animate-spin", uk: ukrainianCopy.enSyncing, en: englishCopy.enSyncing },
};

export function driveSyncStatus(status: string) {
  return Object.hasOwn(statuses, status) ? statuses[status as keyof typeof statuses] : statuses.running;
}
