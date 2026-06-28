// CLI backfill — easiest way to populate the DB without running the server.
//   npm run ingest                              -> all facilities, full backfill
//   npm run ingest -- --facility 101            -> one facility, full backfill
//   npm run ingest -- --facility 101 --limit 10 --once  -> ONE 10-patient slice (smoke test)
//   npm run ingest -- --since 2026-05-01T00:00:00       -> incremental
//
// NOTE: --limit is the SLICE size (patients per batch). Without --once the whole
// facility is ingested in slices. --once runs exactly one slice then stops.

import "dotenv/config";
import { syncAll, syncFacility, syncSlice } from "../lib/ingest/sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const facility = arg("facility");
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const since = arg("since");
  const once = has("once");

  console.log(`[ingest] start ${new Date().toISOString()} facility=${facility ?? "all"} limit=${limit ?? "default"} once=${once}`);
  const t0 = Date.now();

  if (once) {
    const f = Number(facility ?? 101);
    const r = await syncSlice({ facilityId: f, limit: limit ?? 25, offset: 0, since });
    console.log(`[ingest] facility ${r.facilityId}: processed ${r.processed} of ${r.total} (offset now ${r.offset}, done=${r.done})`);
  } else {
    const results = facility
      ? [await syncFacility(Number(facility), { limit, since })]
      : await syncAll({ limit, since });
    for (const r of results) {
      console.log(`[ingest] facility ${r.facilityId}: processed ${r.processed}/${r.total} patients`);
    }
  }

  console.log(`[ingest] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[ingest] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
