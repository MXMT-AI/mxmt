import {apiError} from "./api-contracts";
import {MarketEvidenceError} from "./market-evidence";
import {AiExecutionError} from "./ai-execution/contracts";
import {logError} from "./observability";
import { marketEvidenceApiMessages as englishApiMessages } from "@/messages/en.json";
export function marketEvidenceApiError(error:unknown){
 if(error instanceof MarketEvidenceError||error instanceof AiExecutionError)return apiError(englishApiMessages.marketEvidenceIsUnavailableCheckSource,error.status,error.code);
 logError("Market evidence request failed",error);return apiError(englishApiMessages.couldNotLoadMarketEvidence,503,"MARKET_EVIDENCE_UNAVAILABLE");
}
