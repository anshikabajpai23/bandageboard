// GET /api/eligibility — the contract Person 3's dashboard consumes.
// Filters: ?facility=101 &decision=auto_accept &payer=MCB
// PHI masking is enforced in computeEligibility (only EligibilityResult leaves).

import { NextRequest, NextResponse } from "next/server";
import { computeEligibility } from "@/lib/eligibility/compute";
import type { Decision } from "@/lib/types";

export const dynamic = "force-dynamic";

const DECISIONS: Decision[] = ["auto_accept", "flag_for_review", "reject"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const facility = sp.get("facility") ? Number(sp.get("facility")) : undefined;
  const decisionRaw = sp.get("decision") as Decision | null;
  const decision = decisionRaw && DECISIONS.includes(decisionRaw) ? decisionRaw : undefined;
  const payer = sp.get("payer") ?? undefined;

  try {
    const rows = await computeEligibility({ facility, decision, payer });
    const summary = {
      total: rows.length,
      auto_accept: rows.filter((r) => r.decision === "auto_accept").length,
      flag_for_review: rows.filter((r) => r.decision === "flag_for_review").length,
      reject: rows.filter((r) => r.decision === "reject").length,
    };
    return NextResponse.json({ summary, results: rows });
  } catch (err) {
    // Never leak PHI in errors.
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
