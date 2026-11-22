import type { ConnectorConnectionMessages } from "../use-connector-connection";
import type { Lang } from "@/lib/translations";
import { keyCrmConnectionMessages as keyCrmConnectionMessagesEn } from "@/messages/en.json";
import { keyCrmConnectionMessages as keyCrmConnectionMessagesUk } from "@/messages/uk.json";

export const keyCrmConnectionMessages = { uk: keyCrmConnectionMessagesUk, en: keyCrmConnectionMessagesEn } satisfies Record<Lang, ConnectorConnectionMessages>;
