import { apiError } from "./api-contracts";
import { CustomLabelError } from "./custom-labels";
import { AiExecutionError } from "./ai-execution/contracts";
import { merchandisingApiError } from "./merchandising-api-error";
import { logError } from "./observability";
import { customLabelApiMessages as englishApiMessages } from "@/messages/en.json";
export function customLabelApiError(error:unknown){
  if(error instanceof CustomLabelError)return apiError(englishApiMessages.couldNotPrepareCustomLabelsCheck,error.status,error.code,error.details);
  if(error instanceof AiExecutionError)return apiError(englishApiMessages.customLabelContextIsUnavailableForThis,error.status,error.code);
  const response=merchandisingApiError(error);
  if(response.status>=500)logError("Custom-label request failed",error);
  return response;
}
