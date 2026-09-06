import { NextResponse } from "next/server";
import { resetState, getState } from "@/lib/store";

export async function POST() {
  await resetState();
  return NextResponse.json({ state: await getState() });
}
