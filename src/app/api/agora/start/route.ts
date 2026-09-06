import { NextRequest, NextResponse } from "next/server";
import { startAgent } from "@/lib/agora";

// Call this right after the browser has joined the Agora RTC channel and
// published its microphone. Needs a PUBLIC https URL for THIS app so
// Agora's servers can call back into /api/agora/llm (a localtunnel/ngrok
// URL in dev — see LLM_WEBHOOK_BASE_URL in .env.local).
export async function POST(req: NextRequest) {
  const { channel } = await req.json();

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const webhookBase = process.env.LLM_WEBHOOK_BASE_URL;
  if (!webhookBase) {
    return NextResponse.json(
      { error: "LLM_WEBHOOK_BASE_URL is not set (needs a public https URL)" },
      { status: 500 }
    );
  }

  try {
    const result = await startAgent({
      channel,
      llmWebhookUrl: `${webhookBase.replace(/\/$/, "")}/api/agora/llm`,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to start agent" },
      { status: 500 }
    );
  }
}
