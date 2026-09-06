import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

// CRITICAL: without this, Next.js/Vercel can treat this GET route as
// static and cache its response at deploy time — meaning every poll
// from the dashboard would keep getting the SAME frozen snapshot from
// whenever it was last built, never the live Redis data. This forces
// it to actually run fresh on every single request.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  const state = await getState();
  // Explicit no-store header on the response itself — belt and suspenders
  // against any CDN/edge caching layer that might ignore the route config
  // above.
  return NextResponse.json(
    { state },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
