import {apiError} from "./api-contracts";
import {MarketEvidenceError} from "./market-evidence";
import {AiExecutionError} from "./ai-execution/contracts";
import {logError} from "./observability";
export function marketEvidenceApiError(error:unknown){
 if(error instanceof MarketEvidenceError||error instanceof AiExecutionError)return apiError("Market evidence is unavailable. Check source approval, rights, quota and scope.",error.status,error.code);
 logError("Market evidence request failed",error);return apiError("Could not load market evidence.",503,"MARKET_EVIDENCE_UNAVAILABLE");
}
