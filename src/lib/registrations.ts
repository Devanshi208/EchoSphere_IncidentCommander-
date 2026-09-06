import { redis } from "./redis";

export interface Registration {
  name: string;
  email: string;
  wantsSummaryEmail: boolean;
  registeredAt: string;
}

// Same reasoning as store.ts: this must be shared across serverless
// instances, not per-instance memory, or registrations made on one
// instance would be invisible to the /api/summary/email call that
// happens to land on a different instance.
const REGISTRATIONS_KEY = "echosphere:registrations";

export async function getRegistrations(): Promise<Registration[]> {
  const stored = await redis.get<Registration[]>(REGISTRATIONS_KEY);
  return stored ?? [];
}

export async function addRegistration(reg: Registration): Promise<void> {
  const list = await getRegistrations();
  const idx = list.findIndex((r) => r.email.toLowerCase() === reg.email.toLowerCase());
  if (idx >= 0) {
    list[idx] = reg;
  } else {
    list.push(reg);
  }
  await redis.set(REGISTRATIONS_KEY, list);
}

export async function getConsentedEmails(): Promise<{ name: string; email: string }[]> {
  const list = await getRegistrations();
  return list.filter((r) => r.wantsSummaryEmail).map((r) => ({ name: r.name, email: r.email }));
}
