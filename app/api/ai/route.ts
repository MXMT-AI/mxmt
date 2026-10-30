import { isLocale } from "@/i18n/routing";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chat, type ChatMessage } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";
import { merchandisingChat } from "@/lib/merchandising-chat";
import { AiExecutionError } from "@/lib/ai-execution/contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 180;

const MESSAGE_ROLES = new Set(["user", "assistant", "system"]);

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.ai");

  try {
    const { user, response } = await requireApiUser("ANALYST", context.requestId);
    if (response) return withRequestId(response, context.requestId);

    const { data, response: parseResponse } = await parseJsonBody(request, context.requestId);
    if (parseResponse) return withRequestId(parseResponse, context.requestId);

    if (!isRecord(data)) {
      return withRequestId(validationError(["body must be an object"], context.requestId), context.requestId);
    }

    if (data.locale !== undefined && !isLocale(data.locale)) {
      return withRequestId(validationError(["unsupported locale"], context.requestId), context.requestId);
    }

    if (data.mode !== undefined) {
      if (data.mode !== "merchandising") return withRequestId(validationError(["unsupported AI mode"],context.requestId),context.requestId);
      const reply=await merchandisingChat({tenantId:user.tenantId,userId:user.userId},data);
      const status=reply.mode!=="fallback"?200:
        reply.code?.includes("BUDGET_EXCEEDED")?429:reply.code==="AI_INPUT_LIMIT"?413:
          ["AI_PROVIDER_UNAVAILABLE","AI_INVALID_OUTPUT","AI_OUTPUT_TRUNCATED","AI_INVALID_USAGE","AI_USAGE_OVERRUN"].includes(reply.code??"")?502:409;
      return withRequestId(NextResponse.json({...reply,requestId:context.requestId},{status,headers:{"Cache-Control":"no-store"}}),context.requestId);
    }

    const issues: string[] = [];
    const systemPrompt = stringField(data, "systemPrompt", issues, { maxLength: 8000 });
    const messagesRaw = data.messages;

    if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
      issues.push("messages must be a non-empty array");
    }

    const messages: ChatMessage[] = [];
    if (Array.isArray(messagesRaw)) {
      messagesRaw.forEach((message, index) => {
        if (!isRecord(message)) {
          issues.push(`messages[${index}] must be an object`);
          return;
        }

        const role = stringField(message, "role", issues, { required: true });
        const content = stringField(message, "content", issues, { required: true, maxLength: 16000 });
        if (role && !MESSAGE_ROLES.has(role)) {
          issues.push(`messages[${index}].role must be user, assistant, or system`);
        }

        if (role && content) {
          messages.push({ role: role as ChatMessage["role"], content });
        }
      });
    }

    if (issues.length > 0) {
      return withRequestId(validationError(issues, context.requestId), context.requestId);
    }

    const cookieStore = await cookies();
    const providerOverride = cookieStore.get("ai_provider")?.value;

    const languagePrompt = data.locale === undefined ? systemPrompt : `${systemPrompt ?? ""}\nRespond in ${data.locale === "en" ? "English" : "Ukrainian"}.`;
    const content = await chat({ systemPrompt: languagePrompt, messages, providerOverride });

    return withRequestId(NextResponse.json({ content, requestId: context.requestId }), context.requestId);
  } catch (err) {
    if(err instanceof AiExecutionError){
      if(err.status >= 500)logError("AI request failed",err.cause ?? err,requestLogContext(context));
      return withRequestId(apiError(err.code,err.status,err.code,undefined,context.requestId),context.requestId);
    }
    logError("AI request failed", err, requestLogContext(context));
    return withRequestId(serverError("AI request failed", context.requestId), context.requestId);
  }
}
