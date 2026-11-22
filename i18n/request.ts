import { getRequestConfig } from "next-intl/server";
import { getInterfaceMessages } from "./interface-messages";
import { isLocale, routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  const catalog = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages: getInterfaceMessages(catalog),
    timeZone: "Europe/Kyiv",
  };
});
