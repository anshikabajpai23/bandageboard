// Verify the end-to-end decision output against stored data (no server needed).
//   npm run verify
import "dotenv/config";
import { computeEligibility } from "../lib/eligibility/compute";

async function main() {
  const rows = await computeEligibility();
  const summary = {
    total: rows.length,
    auto_accept: rows.filter((r) => r.decision === "auto_accept").length,
    flag_for_review: rows.filter((r) => r.decision === "flag_for_review").length,
    reject: rows.filter((r) => r.decision === "reject").length,
  };
  console.log("SUMMARY:", JSON.stringify(summary));
  console.log("\nSample rows:");
  for (const r of rows.slice(0, 10)) {
    const w = r.wound;
    const dims = w ? `${w.wound_type ?? "?"} ${w.length_cm}x${w.width_cm}x${w.depth_cm} drain=${w.drainage_amount}` : "no wound";
    console.log(
      `  ${r.display_name_masked.padEnd(18)} mcb=${r.has_active_mcb ? "Y" : "N"}  ${r.decision.padEnd(16)} | ${dims}`
    );
    console.log(`      reason: ${r.reason}`);
  }

  // PHI leak guard: nothing but EligibilityResult fields should be present.
  const allowed = new Set(["patient_id", "display_name_masked", "facility_id", "has_active_mcb", "wound", "decision", "reason"]);
  const leaks = rows.flatMap((r) => Object.keys(r).filter((k) => !allowed.has(k)));
  console.log(`\nPHI leak check: ${leaks.length === 0 ? "PASS (no extra fields)" : "FAIL: " + leaks.join(",")}`);
  process.exit(0);
}
main().catch((e) => { console.error("verify FAILED:", e); process.exit(1); });
