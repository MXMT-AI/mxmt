import type { Row } from "./calendar-types";
import { calendarMarketingCalendarCalendarRowsMessages as englishCopy } from "@/messages/en.json";
import { calendarMarketingCalendarCalendarRowsMessages as ukrainianCopy } from "@/messages/uk.json";

export const calendarRows: Row[] = [
  { t: "g", l: ukrainianCopy.lЗагальнаІнформація },
  { t: "r", l: ukrainianCopy.lАкцентКомунікації, k: "accent" },
  { t: "r", l: ukrainianCopy.lАкцент2, k: "accent2" },
  { t: "r", l: ukrainianCopy.lАкцент3, k: "accent3" },
  { t: "r", l: ukrainianCopy.lФокусБренди, k: "focus" },
  { t: "r", l: ukrainianCopy.lПромо, k: "promo" },
  { t: "r", l: ukrainianCopy.lПодії, k: "events" },
  { t: "g", l: ukrainianCopy.lСайт },
  { t: "r", l: ukrainianCopy.lСлайдерБанер1, k: "ban1" },
  { t: "r", l: ukrainianCopy.lСлайдерБанер2, k: "ban2" },
  { t: "r", l: ukrainianCopy.lСлайдерБанер3, k: "ban3" },
  { t: "r", l: englishCopy.lEmailSMS, k: "comm" },
  { t: "g", l: ukrainianCopy.lРеклама },
  { t: "r", l: "Ads 1", k: "ads1" },
  { t: "r", l: "Ads 2", k: "ads2" },
  { t: "r", l: "Ads 3", k: "ads3" },
  { t: "r", l: "Ads 4", k: "ads4" },
  { t: "g", l: ukrainianCopy.lСоцмережі },
  { t: "r", l: ukrainianCopy.lАкцентТижня, k: "smm1" },
  { t: "r", l: ukrainianCopy.lЗйомки, k: "shoot" },
  { t: "g", l: ukrainianCopy.lПостачання },
  { t: "r", l: ukrainianCopy.lПостачання, k: "supply" },
];
