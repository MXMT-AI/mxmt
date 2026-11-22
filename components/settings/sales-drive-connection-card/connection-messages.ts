import type { ConnectorConnectionMessages } from "../use-connector-connection";
import type { Lang } from "@/lib/translations";
import { salesDriveConnectionMessages as salesDriveConnectionMessagesEn } from "@/messages/en.json";
import { salesDriveConnectionMessages as salesDriveConnectionMessagesUk } from "@/messages/uk.json";

export const salesDriveConnectionMessages = { uk: salesDriveConnectionMessagesUk, en: salesDriveConnectionMessagesEn } satisfies Record<Lang, ConnectorConnectionMessages>;
