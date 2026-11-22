import type { Locale } from "@/i18n/routing";

import type { LandingFeatureId } from "./landing-features";
import { landingCopy as landingCopyEn } from "@/messages/en.json";
import { landingCopy as landingCopyUk } from "@/messages/uk.json";

type Feature = { title: string; description: string };

export const landingCopy = { uk: landingCopyUk, en: landingCopyEn } satisfies Record<Locale, {
  announcement: string;
  navigation: string;
  menu: string;
  product: string;
  workflow: string;
  agents: {
    nav: string;
    heading: string;
    description: string;
    stages: Record<"salesAndStock" | "pricingAndReplenishment" | "marketingAndCalendar" | "campaignsAndReport", Feature>;
  };
  integrations: string;
  login: string;
  register: string;
  language: string;
  changeLanguage: string;
  audience: string;
  headline: { firstLine: string; secondLine: string };
  description: string;
  explore: string;
  productHeading: string;
  features: Record<LandingFeatureId, Feature>;
  workflowHeading: string;
  steps: Feature[];
  integrationsHeading: string;
  integrationsDescription: string;
  closing: string;
}>;

export type LandingCopy = (typeof landingCopy)[Locale];
