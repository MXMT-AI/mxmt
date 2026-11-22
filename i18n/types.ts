import type { Locale } from "./routing";
import type { InterfaceMessages } from "./interface-messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: InterfaceMessages;
  }
}
