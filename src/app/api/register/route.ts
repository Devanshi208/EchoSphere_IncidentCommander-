import { NextRequest, NextResponse } from "next/server";
import { addRegistration } from "@/lib/registrations";

export async function POST(req: NextRequest) {
  const { name, email, wantsSummaryEmail } = await req.json();

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  await addRegistration({
    name: name.trim(),
    email: email.trim(),
    wantsSummaryEmail: !!wantsSummaryEmail,
    registeredAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
