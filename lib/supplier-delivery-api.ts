import {apiError} from "./api-contracts";
import {SupplierDeliveryError} from "./supplier-delivery";
import {RetrospectiveExecutionError} from "./retrospective-contract";
import {AiExecutionError} from "./ai-execution/contracts";
import {ScreenApiError} from "./merchandising-snapshot";
import {logError} from "./observability";
import { supplierDeliveryApiMessages as englishApiMessages } from "@/messages/en.json";
export function supplierDeliveryApiError(error:unknown){if(error instanceof SupplierDeliveryError||error instanceof RetrospectiveExecutionError||error instanceof AiExecutionError||error instanceof ScreenApiError)return apiError(englishApiMessages.checkSupplierRecipientApprovalExportGroup,error.status,error.code);logError("Supplier delivery operation failed",error);return apiError(englishApiMessages.couldNotProcessSupplierDelivery,503,"SUPPLIER_DELIVERY_UNAVAILABLE");}
