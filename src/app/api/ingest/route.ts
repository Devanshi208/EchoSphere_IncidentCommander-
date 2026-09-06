import { NextRequest, NextResponse } from "next/server";
import { getState, setState, bumpTurnsSinceSpeech, resetTurnsSinceSpeech } from "@/lib/store";
import { extractFromLine } from "@/lib/extract";
import { mergeExtraction } from "@/lib/merge";

// This is the single entry point every transcript line flows through,
// whether it comes from Agora's STT output or the manual text box.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const speaker: string = body.speaker ?? "Unknown";
  const text: string = body.text ?? "";

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const state = await getState();

  try {
    const extraction = await extractFromLine(speaker, text, state);
    const next = mergeExtraction(state, extraction, speaker);
    await setState(next);
    if (extraction.aiShouldSpeak) {
      await resetTurnsSinceSpeech();
    } else {
      await bumpTurnsSinceSpeech();
    }
    return NextResponse.json({ state: next, extraction });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 500 }
    );
  }
}
