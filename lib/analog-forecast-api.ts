import {apiError} from "./api-contracts";
import {AnalogForecastError} from "./analog-forecast";
import {AiExecutionError} from "./ai-execution/contracts";
import {ProductAttributeError} from "./product-attributes";
import {CustomLabelError} from "./custom-labels";
import {ScreenApiError} from "./merchandising-snapshot";
import {logError} from "./observability";
export function analogForecastApiError(error:unknown){
 if(error instanceof AnalogForecastError||error instanceof AiExecutionError||error instanceof ProductAttributeError||error instanceof CustomLabelError||error instanceof ScreenApiError)return apiError("Forecast preview requires a current snapshot, verified evidence and an explicit draft policy.",error.status,error.code);
 logError("Analog forecast preview failed",error);return apiError("Could not prepare forecast preview.",503,"ANALOG_FORECAST_UNAVAILABLE");
}
