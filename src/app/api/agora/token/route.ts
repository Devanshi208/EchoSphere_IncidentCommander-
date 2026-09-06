import { NextRequest, NextResponse } from "next/server";
import { buildRtcToken } from "@/lib/agoraToken";

export async function POST(req: NextRequest) {
  const { channel } = await req.json();
  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const appId = process.env.AGORA_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "AGORA_APP_ID not set" }, { status: 500 });
  }

  // A random uid per browser tab/participant. 1..99999, well clear of the
  // fixed agent uid (see AGENT_RTC_UID in src/lib/agoraToken.ts).
  const uid = Math.floor(Math.random() * 90000) + 10000;

  try {
    const token = buildRtcToken(channel, uid, "publisher");
    return NextResponse.json({ token, uid, appId, channel });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "token generation failed" },
      { status: 500 }
    );
  }
}
