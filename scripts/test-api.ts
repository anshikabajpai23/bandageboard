// Live PCC API smoke test — proves the retry client survives 429s.
// Network only, NO database needed.
//   npm run test:api
// Hammers /pcc/patients + a few sub-resources; with a 30% 429 rate this WILL
// hit rate limits, and the client should transparently recover.

import "dotenv/config";
import { getPatients, getDiagnoses, getCoverage, getNotes, getAssessments } from "../lib/ingest/client";

async function main() {
  console.log("[test:api] fetching Facility 101 patients...");
  const patients = await getPatients(101);
  console.log(`[test:api] got ${patients.length} patients (expected ~100)`);
  if (patients.length === 0) throw new Error("no patients returned");

  const sample = patients.slice(0, 3);
  for (const p of sample) {
    const [d, c, n, a] = await Promise.all([
      getDiagnoses(p.patient_id),
      getCoverage(p.patient_id),
      getNotes(p.id),
      getAssessments(p.id),
    ]);
    console.log(
      `[test:api] ${p.patient_id} (id=${p.id}): ${d.length} dx, ${c.length} coverage, ${n.length} notes, ${a.length} assessments`
    );
  }
  console.log("[test:api] PASS — retry client survived the 429s.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[test:api] FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
