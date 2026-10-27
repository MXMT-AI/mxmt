import { connectionHandlers } from "@/lib/connectors/connection-route";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export const {GET,PUT,POST}=connectionHandlers("salesdrive");
