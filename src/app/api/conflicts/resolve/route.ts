import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

// Closes the loop the dashboard visually opens when a conflict appears.
// This does NOT ask the LLM to decide who was right — a human resolves it,
// same "human stays in control of consequential calls" principle as the
// tool-approval flow.
export async function POST(req: NextRequest) {
  const { conflictId, resolutionNote } = await req.json();
  const state = await getState();
  const conflict = state.conflicts.find((c) => c.id === conflictId);

  if (!conflict) {
    return NextResponse.json({ error: "conflict not found" }, { status: 404 });
  }

  conflict.resolved = true;
  const now = new Date().toISOString();
  state.timeline.push({
    id: `tl_${Date.now()}`,
    timestamp: now,
    label: `CONFLICT RESOLVED: ${conflict.description}${
      resolutionNote ? ` — ${resolutionNote}` : ""
    }`,
  });

  await setState(state);
  return NextResponse.json({ state });
}
