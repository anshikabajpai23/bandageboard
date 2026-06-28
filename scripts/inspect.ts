import "dotenv/config";
import { db, schema } from "../lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const cov = await db.select().from(schema.coverage).limit(8);
  console.log("=== COVERAGE (raw payer_type / effective_to) ===");
  for (const c of cov) console.log(`  ${c.patientId}  type=${JSON.stringify(c.payerType)}  code=${c.payerCode}  to=${JSON.stringify(c.effectiveTo)}`);

  const asm = await db.select().from(schema.assessments).limit(3);
  console.log("\n=== ASSESSMENT raw_json ===");
  for (const a of asm) console.log(`  pid=${a.patientId} type=${a.assessmentType}\n    ${a.rawJson}`);

  const nt = await db.select().from(schema.notes).limit(2);
  console.log("\n=== NOTE note_type + first 200 chars ===");
  for (const n of nt) console.log(`  pid=${n.patientId} type=${n.noteType}\n    ${(n.noteText ?? "").slice(0, 200)}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
