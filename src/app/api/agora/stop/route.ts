import { NextRequest, NextResponse } from "next/server";
import { stopAgent } from "@/lib/agora";

export async function POST(req: NextRequest) {
  const { agentId } = await req.json();
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  try {
    const result = await stopAgent(agentId);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to stop agent" },
      { status: 500 }
    );
  }
}
