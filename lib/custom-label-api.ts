import { apiError } from "./api-contracts";
import { CustomLabelError } from "./custom-labels";
import { AiExecutionError } from "./ai-execution/contracts";
import { merchandisingApiError } from "./merchandising-api-error";
import { logError } from "./observability";
export function customLabelApiError(error:unknown){
  if(error instanceof CustomLabelError)return apiError("Could not prepare custom labels. Check the approved profile, item mappings and current preview.",error.status,error.code,error.details);
  if(error instanceof AiExecutionError)return apiError("Custom-label context is unavailable for this account or role.",error.status,error.code);
  const response=merchandisingApiError(error);
  if(response.status>=500)logError("Custom-label request failed",error);
  return response;
}
