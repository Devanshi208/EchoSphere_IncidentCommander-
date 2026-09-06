import { NextRequest } from "next/server";
import {
  getState,
  setState,
  bumpTurnsSinceSpeech,
  resetTurnsSinceSpeech,
} from "@/lib/store";
import { extractFromLine } from "@/lib/extract";
import { mergeExtraction } from "@/lib/merge";
import { IncidentState } from "@/lib/types";

// Agora's Conversational AI Engine calls this URL for every conversational
// turn, in an OpenAI chat-completions-shaped request:
//   { model, messages: [{ role, content, turn_id, timestamp }, ...] }
// We take the newest "user" message as the new transcript line, run it
// through the extract+merge pipeline, and reply with what (if anything)
// the AI should say — streamed as Server-Sent Events, since Agora's TTS
// pipeline expects a streaming chat-completion response, not one static
// JSON blob (a static blob was the likely reason nothing was ever spoken
// beyond the fixed greeting_message, which comes from Agora's own config
// rather than this endpoint at all).
//
// GUARANTEED NUDGE: real incident commanders don't wait for permission to
// speak up. Rather than relying entirely on the model's own per-line
// judgment (which can be too conservative under time pressure), this
// route also tracks how many lines have passed since the AI last spoke.
// If 3 lines go by with nothing said AND there's an unresolved unknown or
// conflict sitting in state, it forces a spoken check-in on the single
// most important open item — matching "ask the most important unresolved
// question, then let the room turn it into a hypothesis."

interface AgoraTurnMessage {
  role: "system" | "user" | "assistant";
  content: string;
  turn_id?: number;
  timestamp?: number;
  user_id?: string;
  name?: string;
}

const NUDGE_AFTER_TURNS = 3;

function pickNudge(state: IncidentState): string | null {
  const openUnknown = state.unknowns.find((u) => !u.resolved);
  if (openUnknown) {
    return `Quick check-in — we still don't know: ${openUnknown.question} Any read on that?`;
  }
  const openConflict = state.conflicts.find((c) => !c.resolved);
  if (openConflict) {
    return `We still have an open conflict: ${openConflict.description} Can we settle which one holds?`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: AgoraTurnMessage[] = body.messages ?? [];
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  console.log(
    "[agora/llm] incoming turn:",
    JSON.stringify({ messageCount: messages.length, lastUser: lastUserMsg })
  );

  if (!lastUserMsg?.content?.trim()) {
    return streamReply("");
  }

  const speaker = lastUserMsg.name ?? lastUserMsg.user_id ?? "Room";
  const state = await getState();

  try {
    const extraction = await extractFromLine(speaker, lastUserMsg.content, state);
    const next = mergeExtraction(state, extraction, speaker);
    await setState(next);

    let speech = "";

    if (extraction.aiShouldSpeak && extraction.aiSpeech) {
      speech = extraction.aiSpeech;
      await resetTurnsSinceSpeech();
    } else {
      const turns = await bumpTurnsSinceSpeech();
      if (turns >= NUDGE_AFTER_TURNS) {
        const nudge = pickNudge(next);
        if (nudge) {
          speech = nudge;
          await resetTurnsSinceSpeech();
        }
      }
    }

    console.log("[agora/llm] speech decision:", JSON.stringify({ speaker, speech }));

    return streamReply(speech);
  } catch (err) {
    console.error("[agora/llm] webhook error", err);
    return streamReply("");
  }
}

// Sends a minimal valid SSE chat-completion-chunk stream, which is what
// Agora's TTS pipeline expects to actually speak the content — a single
// non-streamed JSON response was very likely being silently ignored.
function streamReply(speech: string): Response {
  const encoder = new TextEncoder();
  const id = `incident-commander-${Date.now()}`;

  const stream = new ReadableStream({
    start(controller) {
      const contentChunk = {
        id,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: speech }, finish_reason: null }],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));

      const doneChunk = {
        id,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
