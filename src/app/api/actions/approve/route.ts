import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";
import { runTool } from "@/lib/tool";

// This is the "AI proposes -> human approves -> tool executes" pipeline
// from the debrief doc, section 13. Swap runTool() for a real Jira/Slack/
// PagerDuty call when you wire up your one tool integration.
export async function POST(req: NextRequest) {
  const { actionId } = await req.json();
  const state = await getState();
  const action = state.actions.find((a) => a.id === actionId);

  if (!action) {
    return NextResponse.json({ error: "action not found" }, { status: 404 });
  }

  action.approved = true;
  action.status = "in_progress";

  const result = await runTool(action.description);

  action.status = "done";
  state.timeline.push({
    id: `tl_${Date.now()}`,
    timestamp: new Date().toISOString(),
    label: `TOOL EXECUTED: ${action.description} -> ${result}`,
  });

  await setState(state);
  return NextResponse.json({ state, result });
}
