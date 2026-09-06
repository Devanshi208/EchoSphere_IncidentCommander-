# EchoSphere — Incident Commander

**⚠️ READ THIS FIRST — WHERE TO PUT THIS FOLDER**

Do NOT unzip or run this project inside a OneDrive, Google Drive, Dropbox,
or any other cloud-synced folder (e.g. `C:\Users\YourName\OneDrive\...`).
Cloud sync services actively lock and re-write files while a dev server is
running, which causes exactly the kind of "I edited the file but nothing
changed" symptoms that are very hard to debug. 

Unzip this to a plain local path instead, for example:
```
C:\Projects\echosphere
```
or on Mac/Linux:
```
~/projects/echosphere
```
Then open THAT folder in VS Code (File > Open Folder), and do everything
below from there.

Voice-native AI Incident Commander for the EchoSphere hackathon (Neural
Narrators). This README is the "get it running on your laptop" guide —
read top to bottom the first time.

## What's built so far

- **The brain**: every transcript line → structured facts / hypotheses /
  conflicts / unknowns / actions / decisions / timeline, via a forced-schema
  LLM call, validated before it touches state.
- **Live dashboard**: color-coded panels, updates as lines come in.
- **Human-in-the-loop actions**: AI proposes → you approve → stub tool
  "executes" (swap for real Jira/Slack/PagerDuty on Day 4).
- **Final summary**: one button, generates a report that explicitly
  refuses to invent anything the state doesn't support. Exportable as
  markdown or PDF (browser print).
- **Conflict resolution**: mark a flagged conflict resolved, optionally
  noting what settled it.
- **Participants panel**: who's been in the room.
- **Agora voice layer (backend half)**: webhook + start/stop routes ready.
  The missing piece is a client page that actually joins the Agora RTC
  channel by voice — not built yet, see "What's NOT built" below.

## 1. Install and run (no voice yet — text-box testing)

You need [Node.js](https://nodejs.org) 18+ installed. Check with:
```bash
node -v
```

Then, from inside the unzipped `echosphere` folder:

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` in any text editor and paste in your Anthropic API key
(get one at https://console.anthropic.com — the `ANTHROPIC_API_KEY` line):

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then start it:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. That's the dashboard.

## 2. Test the brain (no voice needed yet)

On the left, there's a "simulate transcript line" box — this stands in
for what Agora's speech-to-text will eventually send. Pick a speaker,
type a line, hit "send line". Try this sequence, in order:

1. Alex: `Payment failures started around 14:07.`
2. Maya: `I think the payment provider is down.`
3. Jordan: `The provider's health dashboard is showing everything as normal.`
4. Alex: `I'll check the API logs.`
5. Maya: `Can we get a Jira ticket for the provider investigation?`

Watch the right-hand panels fill in live: line 1 → Facts, line 2 →
Hypotheses (it's hedged with "I think"), line 3 → a Conflict against
line 2, line 4 → an Action owned by Alex. Try clicking **approve** on an
action that needs it, **resolve** on the conflict, and then **final
summary** at the top to see the closing report — then **export .md** or
**save as pdf** to download it.

**reset demo** wipes everything and starts fresh — use this before every
real practice run so old test data doesn't show up mid-demo.

## 3. What's NOT built yet (your next steps)

- **The actual voice client** — a page where real people join an Agora
  RTC channel by voice. The backend (`/api/agora/start`, `/api/agora/stop`,
  `/api/agora/llm`) is ready to receive it, but nothing calls it yet.
- **Real Agora credentials** wired up (see below) — currently the app
  only works via the text box.
- **A real tool integration** — `src/lib/tool.ts` fakes a Jira ticket
  right now. Swap it for a real API call once you've picked one.

## 4. Wiring up real voice (Agora) — now built

The browser now does a real voice join, not just a server-side agent
invite. Here's the full flow:

1. Click **JOIN AGORA VOICE CHANNEL**. The browser:
   - fetches a real signed token from `/api/agora/token`
   - joins the Agora RTC channel with `agora-rtc-sdk-ng`
   - opens your microphone and publishes it into the channel
   - calls `/api/agora/start`, which invites the AI agent into that
     same channel (server generates the agent's own token internally)
   - subscribes to and plays back the agent's audio when it speaks
2. Talk normally. Agora transcribes it and POSTs each turn to
   `/api/agora/llm` — the exact same brain the text box uses.
3. Click **DISCONNECT / LEAVE ROOM** to stop the agent and leave cleanly.

### Setup

- Fill in `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_KEY`,
  `AGORA_CUSTOMER_SECRET` in `.env.local` (Agora Console > your project).
  The App Certificate is what lets us mint real signed tokens — this
  replaces any mock/placeholder token string.
- Get a public https URL for your laptop (`ngrok http 3000`, or a
  localtunnel URL like `https://your-app.loca.lt`) and set
  `LLM_WEBHOOK_BASE_URL` to it.
- For ElevenLabs TTS (the default): set `ELEVENLABS_API_KEY` and
  `ELEVENLABS_VOICE_ID`. Note ElevenLabs requires a **paid plan** for
  reliable TTS — their free tier gets throttled by abuse detection,
  which can look like "the agent joined but never speaks."
- Your browser will ask for microphone permission on first join —
  allow it, or nothing will publish.

### Two known things to verify once you're testing live

- **Speaker identification in multi-party rooms**: `/api/agora/llm`
  currently falls back to a generic "Room" label if Agora doesn't send
  a per-speaker name/uid on each turn. Log the raw `messages` payload
  once on a real multi-person call and check — if it's missing, have
  each person lead with their name until this is mapped properly.
- **ASR (speech-to-text)**: this build deliberately omits an `asr` block
  in the agent config so Agora falls back to its managed default. If
  transcription doesn't work out of the box, that's the first thing to
  check in Agora Console — you may need an explicit `asr.vendor` (e.g.
  `"deepgram"`) with its own API key instead of relying on the default.

## How it fits together (for when you're reading the code)

```
transcript line (typed, or later: Agora STT)
        |
        v
POST /api/ingest  ->  src/lib/extract.ts   (LLM, forced tool-use JSON)
        |
        v
src/lib/merge.ts   (validates + applies to state, never trusts LLM blindly)
        |
        v
src/lib/store.ts   (in-memory incident state)
        |
        v
dashboard polls /api/state and re-renders
```

- `src/lib/types.ts` — the whole data model. Read this first.
- `src/lib/extract.ts` — the only place the LLM is called for extraction.
- `src/lib/merge.ts` — turns extraction output into state changes.
- `src/lib/summary.ts` — final report generator.
- `src/lib/tool.ts` — your one tool integration goes here.
- `src/lib/agora.ts` — Agora REST helpers (start/stop the agent).
- `src/app/api/*` — every backend route, one folder each.
- `src/app/page.tsx` — the whole dashboard.

## Troubleshooting

- **"ANTHROPIC_API_KEY is not set"** — you skipped step 1's `.env.local` edit,
  or the dev server was already running before you saved it (restart with
  Ctrl+C then `npm run dev` again).
- **Port 3000 already in use** — something else is running there; stop it,
  or run `npm run dev -- -p 3001` and open that port instead.
- **`npm install` fails** — make sure Node is 18+ (`node -v`); delete
  `node_modules` and `package-lock.json` and try again if it's stuck.
