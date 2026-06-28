// /api/sync — triggers one resumable ingestion slice. Called by Vercel Cron
// (GET, see vercel.json) or manually (POST). Each call processes `limit`
// patients of one facility and advances a DB cursor; re-running is safe.

import { NextRequest, NextResponse } from "next/server";
import { syncSlice } from "@/lib/ingest/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: cap the invocation

function authorized(req: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // disabled
  return req.headers.get("x-sync-secret") === secret || req.nextUrl.searchParams.get("secret") === secret;
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const facility = Number(sp.get("facility") ?? 101);
  const limit = sp.get("limit") ? Number(sp.get("limit")) : 25;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;
  const since = sp.get("since") ?? undefined;

  if (![101, 102, 103].includes(facility)) {
    return NextResponse.json({ error: "facility must be 101, 102, or 103" }, { status: 422 });
  }

  try {
    const result = await syncSlice({ facilityId: facility, limit, offset, since });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
