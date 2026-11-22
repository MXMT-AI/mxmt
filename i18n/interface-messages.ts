import type uk from "@/messages/uk.json";

type Catalog = typeof uk;
export type InterfaceKey = {
  [Key in keyof Catalog]: Catalog[Key] extends string ? Key : never;
}[keyof Catalog];
export type InterfaceMessages = Record<InterfaceKey, string>;

export function getInterfaceMessages(catalog: InterfaceMessages): InterfaceMessages {
  return Object.fromEntries(
    Object.entries(catalog).filter(([, value]) => typeof value === "string"),
  ) as InterfaceMessages;
}
