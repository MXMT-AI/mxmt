import { ArrowDownUp, BarChart3, Boxes, LayoutDashboard, PackagePlus } from "lucide-react";

export const landingFeatures = [
  { id: "overview", Icon: LayoutDashboard },
  { id: "sales", Icon: BarChart3 },
  { id: "stock", Icon: Boxes },
  { id: "repricing", Icon: ArrowDownUp },
  { id: "reordering", Icon: PackagePlus },
] as const;

export type LandingFeatureId = (typeof landingFeatures)[number]["id"];
