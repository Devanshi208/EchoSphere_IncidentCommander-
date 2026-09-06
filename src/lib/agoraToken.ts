import { RtcTokenBuilder, RtcRole } from "agora-token";

// Real, signed RTC tokens — this replaces the "hackathon-mock-token"
// placeholder. Agora rejects anything that isn't actually signed with
// your App Certificate (if your project has one enabled), which is why
// the mock string was silently breaking the agent-invite call.
export function buildRtcToken(
  channel: string,
  uid: number,
  role: "publisher" | "subscriber" = "publisher",
  expireSeconds = 3600
): string {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error("AGORA_APP_ID / AGORA_APP_CERTIFICATE not set");
  }

  const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    rtcRole,
    expireSeconds,
    expireSeconds
  );
}

// Fixed uid reserved for the AI agent so it never collides with a human
// participant's randomly generated uid.
export const AGENT_RTC_UID = Number(process.env.AGORA_AGENT_UID ?? 9999);
