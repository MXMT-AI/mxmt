import type { defaultClientSettings } from "@/lib/merchandising-settings";

export interface Entity extends Record<string, unknown> {
  id: string;
  name: string;
  revision: number;
}
export interface Payload extends Record<string, unknown> {
  client: {
    id: string | null;
    revision: number;
    values: ReturnType<typeof defaultClientSettings>;
  };
  items: Entity[];
  pagination: { page: number; totalRows: number };
  brands: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}
