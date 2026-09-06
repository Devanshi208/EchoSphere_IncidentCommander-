# EchoSphere — Voice-Native AI Incident Commander

**Most AI meeting tools summarize what was said. EchoSphere maintains what is currently known — live, while the incident is still happening.**

**Live demo:** https://echosphere-three.vercel.app
**GitHub:** https://github.com/Devanshi208/EchoSphere_IncidentCommander-

> **The core principle:** The AI organizes evidence and uncertainty. It does not manufacture certainty.

## What it does

EchoSphere joins a live incident call through Agora as a real voice participant — not a chatbot in a sidebar. As engineers talk, it continuously builds a structured operational picture:

- 🟢 **Facts** — confirmed, verified information
- 🟡 **Hypotheses** — anything hedged ("I think", "maybe") is never silently upgraded to fact
- 🔴 **Conflicts** — when two people contradict each other, both statements are preserved and the conflict is flagged. The AI does NOT pick a winner
- ⚪ **Unknowns** — critical missing information the team hasn't established
- 🔵 **Decisions**, 👤 **Actions with owners**, ⏱️ **Live timeline**, 👥 **Participants**

## Key features

- 🎙️ **True voice-native participation** — real Agora RTC channel, real microphones, AI speaks back through ElevenLabs TTS
- 🗣️ **Proactive intervention** — the AI speaks up on new conflicts, blocking unknowns, and unassigned actions. If the room goes quiet with something unresolved, it proactively asks the most important open question
- 🛑 **Human-in-the-loop** — the AI proposes actions but NEVER executes. It phrases them as questions awaiting confirmation ("Rollback the deployment? I need confirmation before that executes"). Only a human clicking approve triggers the tool call
- ✅ **Live conflict resolution** — humans mark conflicts resolved with a note on what settled it
- 📄 **Uncertainty-aware final summary** — explicitly separates what we know / what we suspect / what conflicts / what's unresolved, and refuses to invent a root cause the evidence doesn't support
- 📥 **Export as Markdown or PDF**
- 📧 **Automatic email delivery** — participants opt in on the homepage and receive the full structured summary by email when the incident closes
- 🔇 **Mic mute controls**, live dashboard updating in real time

## Tech stack

- **Voice:** Agora Conversational AI Engine (WebRTC transport, managed STT) with custom LLM webhook (BYOK)
- **TTS:** ElevenLabs (eleven_flash_v2_5)
- **LLM:** Claude (Anthropic) — forced tool-use schemas so the model returns validated structured JSON that cannot corrupt incident state
- **Frontend/Backend:** Next.js 16 + TypeScript, deployed on Vercel
- **State:** Upstash Redis — shared across serverless instances
- **Email:** Resend

## How it works
