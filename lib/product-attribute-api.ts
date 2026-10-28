import {apiError} from "./api-contracts";
import {ProductAttributeError} from "./product-attributes";
import {AiExecutionError} from "./ai-execution/contracts";
import {CustomLabelError} from "./custom-labels";
import {merchandisingApiError} from "./merchandising-api-error";
import {logError} from "./observability";
/** Preserve known validation/context failures while keeping source payloads and database text out of errors. */
export function productAttributeApiError(error:unknown){
  if(error instanceof ProductAttributeError||error instanceof AiExecutionError)return apiError("Product attribute data is unavailable. Check dictionary approval, source samples and snapshot scope.",error.status,error.code);
  if(error instanceof CustomLabelError)return apiError("Product attribute scope is unavailable.",error.status,error.code==="LABEL_SOURCE_MISMATCH"?"ATTRIBUTE_SOURCE_MISMATCH":error.code==="LABEL_ROW_LIMIT"?"ATTRIBUTE_SKU_LIMIT":error.code);
  const response=merchandisingApiError(error);if(response.status>=500)logError("Product attribute request failed",error);return response;
}
