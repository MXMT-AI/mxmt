import { chatCopy as chatCopyEn, citationCopy as citationCopyEn } from "@/messages/en.json";
import { chatCopy as chatCopyUk, citationCopy as citationCopyUk } from "@/messages/uk.json";

export const chatCopy={ uk: chatCopyUk, en: chatCopyEn };
export const citationCopy={ uk: citationCopyUk, en: citationCopyEn };
export function chatNotice(code:string|undefined,copy:typeof chatCopy.uk|typeof chatCopy.en):string {
 if(!code)return copy.provider;
 if(code==="AI_CHAT_EMPTY_QUESTION")return copy.required;
 if(["AI_POLICY_REQUIRED","AI_CAPABILITY_NOT_ENABLED","AI_CONFIGURATION_ERROR"].includes(code))return copy.policy;
 if(code.includes("BUDGET_EXCEEDED"))return copy.budget;
 if(code==="AI_SCENARIO_REQUIRED")return copy.scenario;
 if(code.includes("CONTEXT")||code==="AI_RUN_NOT_ACTIVE")return copy.changed;
 if(code.includes("SCENARIO"))return copy.scenario;
 if(code.includes("HISTORY"))return copy.history;
 if(["AI_EXECUTION_IN_PROGRESS","AGENT_RUN_ALREADY_RUNNING"].includes(code))return copy.processing;
 if(["AI_INPUT_LIMIT","AI_CHAT_SCOPE_LIMIT"].includes(code))return copy.narrow;
 if(code==="AI_FORBIDDEN"||code==="FORBIDDEN")return copy.readOnly;
 return copy.provider;
}
