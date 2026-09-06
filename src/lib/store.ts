import { IncidentState, emptyState } from "./types";
import { redis } from "./redis";

// This used to be an in-memory globalThis singleton — that broke on
// Vercel because each serverless invocation can land on a different
// physical instance, and those instances don't share memory. A fact
// written by the Agora voice webhook could sit invisibly on one instance
// while the dashboard's polling request hit a completely different one
// with no idea that fact existed. Redis (via Upstash's REST API) is a
// real shared store every instance reads from and writes to, so this
// works correctly regardless of which instance handles which request.
//
// Every function here is now async — every caller must `await` these.

const STATE_KEY = "echosphere:incidentState";
const TURNS_KEY = "echosphere:turnsSinceSpeech";

export async function getState(): Promise<IncidentState> {
  const stored = await redis.get<IncidentState>(STATE_KEY);
  return stored ?? emptyState();
}

export async function setState(next: IncidentState): Promise<void> {
  await redis.set(STATE_KEY, next);
}

export async function resetState(): Promise<void> {
  await redis.set(STATE_KEY, emptyState());
  await redis.set(TURNS_KEY, 0);
}

// Tracks how many transcript lines have gone by since the AI last spoke,
// so the voice webhook can force a proactive check-in even if the model's
// own per-line judgment stays quiet too long.
export async function getTurnsSinceSpeech(): Promise<number> {
  const turns = await redis.get<number>(TURNS_KEY);
  return turns ?? 0;
}

export async function bumpTurnsSinceSpeech(): Promise<number> {
  return await redis.incr(TURNS_KEY);
}

export async function resetTurnsSinceSpeech(): Promise<void> {
  await redis.set(TURNS_KEY, 0);
}
