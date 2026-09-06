import { NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { generateSummary } from "@/lib/summary";
import { sendSummaryEmails } from "@/lib/email";

export async function POST() {
  const state = await getState();
  try {
    const summary = await generateSummary(state);
    const result = await sendSummaryEmails(summary);
    return NextResponse.json({ summary, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to email summary" },
      { status: 500 }
    );
  }
}
