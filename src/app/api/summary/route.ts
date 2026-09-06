import { NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { generateSummary } from "@/lib/summary";

// Same reasoning as /api/state — force this to run fresh every time,
// never cached, since it reads live incident state.
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  try {
    const summary = await generateSummary(state);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "summary failed" },
      { status: 500 }
    );
  }
}
