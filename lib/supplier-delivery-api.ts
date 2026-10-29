import {apiError} from "./api-contracts";
import {SupplierDeliveryError} from "./supplier-delivery";
import {RetrospectiveExecutionError} from "./retrospective-contract";
import {AiExecutionError} from "./ai-execution/contracts";
import {ScreenApiError} from "./merchandising-snapshot";
import {logError} from "./observability";
/** Preserve bounded business errors without exposing source/transport/storage bodies. */
export function supplierDeliveryApiError(error:unknown){if(error instanceof SupplierDeliveryError||error instanceof RetrospectiveExecutionError||error instanceof AiExecutionError||error instanceof ScreenApiError)return apiError("Check supplier recipient approval, export group, evidence and action expiry.",error.status,error.code);logError("Supplier delivery operation failed",error);return apiError("Could not process supplier delivery.",503,"SUPPLIER_DELIVERY_UNAVAILABLE");}
