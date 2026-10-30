import {apiError} from "./api-contracts";
import {PriceWritebackError} from "./price-writeback";
import {AiExecutionError} from "./ai-execution/contracts";
import {ScreenApiError} from "./merchandising-snapshot";
import {ConnectorSourceError} from "./connectors/source";
import {logError} from "./observability";
export function priceWritebackApiError(error:unknown){
 if(error instanceof PriceWritebackError||error instanceof AiExecutionError||error instanceof ScreenApiError||error instanceof ConnectorSourceError)return apiError("Price action requires approved access, current evidence and a separate unexpired approval.",error.status,error.code);
 logError("Price write-back operation failed",error);return apiError("Could not process price action.",503,"PRICE_WRITEBACK_UNAVAILABLE");
}
