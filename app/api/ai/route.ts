import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chat, type ChatMessage } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";

const MESSAGE_ROLES = new Set(["user", "assistant", "system"]);

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireApiUser("ANALYST");
    if (response) return response;

    const { data, response: parseResponse } = await parseJsonBody(request);
    if (parseResponse) return parseResponse;

    if (!isRecord(data)) {
      return validationError(["body must be an object"]);
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
      return validationError(issues);
    }

    // Allow per-session override via cookie (set by Settings page)
    const cookieStore = await cookies();
    const providerOverride = cookieStore.get("ai_provider")?.value;

    const content = await chat({ systemPrompt, messages, providerOverride });

    return NextResponse.json({ content });
  } catch (err) {
    console.error("[ai]", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
