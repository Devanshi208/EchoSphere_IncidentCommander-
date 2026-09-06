// Thin wrapper around Agora's Conversational AI Engine REST API.
// Docs: https://docs.agora.io/en/conversational-ai/rest-api/join
//
// Flow this supports:
//   1. The browser (src/app/page.tsx) joins an Agora RTC channel using a
//      real token from /api/agora/token, and publishes its microphone.
//   2. Your server calls startAgent() to bring the AI agent into that
//      same channel, using a separate fixed uid (AGENT_RTC_UID) so it
//      never collides with a participant's uid.
//   3. For every conversational turn, Agora POSTs to OUR webhook
//      (src/app/api/agora/llm/route.ts) in an OpenAI-chat-style format.
//      That's where extraction + state update happens.
//   4. Your server calls stopAgent() when the incident/demo ends.

import { buildRtcToken, AGENT_RTC_UID } from "./agoraToken";

function basicAuthHeader(): string {
  const key = process.env.AGORA_CUSTOMER_KEY;
  const secret = process.env.AGORA_CUSTOMER_SECRET;
  if (!key || !secret) {
    throw new Error(
      "AGORA_CUSTOMER_KEY / AGORA_CUSTOMER_SECRET not set. Get these from " +
        "Agora Console > Project > RESTful API credentials."
    );
  }
  const encoded = Buffer.from(`${key}:${secret}`).toString("base64");
  return `Basic ${encoded}`;
}

// Builds the tts.params object for whichever vendor is configured.
// AGORA_TTS_PARAMS_JSON always wins if you set it (full manual control).
// Otherwise we build sane defaults per vendor so you only need to set the
// one or two env vars that actually matter for that vendor.
function buildTtsConfig(): { vendor: string; params: Record<string, unknown> } {
  const vendor = process.env.AGORA_TTS_VENDOR ?? "elevenlabs";

  if (process.env.AGORA_TTS_PARAMS_JSON) {
    return { vendor, params: JSON.parse(process.env.AGORA_TTS_PARAMS_JSON) };
  }

  if (vendor === "elevenlabs") {
    // Shape confirmed against Agora's ElevenLabs TTS docs: key (not
    // api_key), model_id, voice_id, sample_rate.
    return {
      vendor,
      params: {
        key: process.env.ELEVENLABS_API_KEY,
        model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
        voice_id: process.env.ELEVENLABS_VOICE_ID,
        sample_rate: 24000,
      },
    };
  }

  // openai fallback
  return {
    vendor,
    params: { api_key: process.env.OPENAI_API_KEY, voice: "alloy" },
  };
}

export interface StartAgentOptions {
  channel: string;
  llmWebhookUrl: string; // your PUBLIC https URL for src/app/api/agora/llm
  greeting?: string;
}

export async function startAgent(opts: StartAgentOptions) {
  const appId = process.env.AGORA_APP_ID;
  if (!appId) throw new Error("AGORA_APP_ID not set");

  const agentToken = buildRtcToken(opts.channel, AGENT_RTC_UID, "publisher");
  const tts = buildTtsConfig();

  const body = {
    name: `incident-commander-${opts.channel}-${Date.now()}`,
    properties: {
      channel: opts.channel,
      token: agentToken,
      agent_rtc_uid: String(AGENT_RTC_UID),
      remote_rtc_uids: ["*"],
      idle_timeout: 300,
      llm: {
        url: opts.llmWebhookUrl,
        style: "openai",
        max_history: 40,
        greeting_message:
          opts.greeting ??
          "Incident Commander online. I'll track facts, conflicts, and open questions as we go.",
        failure_message: "One moment, reconnecting.",
      },
      tts: {
        vendor: tts.vendor,
        params: tts.params,
      },
      // No `asr` block: leaving this out lets Agora use its managed
      // default speech-to-text, per your mentor's "no keys needed" note.
      // If transcription doesn't work out of the box, this is the first
      // place to check — Agora Console may require an explicit
      // asr.vendor (e.g. "deepgram") + api_key instead of a default.
    },
  };

  const res = await fetch(
    `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`,
    {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Agora join failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as { agent_id: string; create_ts: number; status: string };
}

export async function stopAgent(agentId: string) {
  const appId = process.env.AGORA_APP_ID;
  if (!appId) throw new Error("AGORA_APP_ID not set");

  const res = await fetch(
    `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`,
    {
      method: "POST",
      headers: { authorization: basicAuthHeader() },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agora leave failed (${res.status}): ${text}`);
  }
  return { stopped: true };
}
