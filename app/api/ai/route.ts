import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chat, type ChatMessage } from "@/lib/ai";
import { requireApiUser } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireApiUser("ANALYST");
    if (response) return response;

    const body = await request.json();
    const messages: ChatMessage[] = body.messages;
    const systemPrompt: string | undefined = body.systemPrompt;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
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
