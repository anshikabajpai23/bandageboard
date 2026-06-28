# system_health.md — IHMS Status Board

> Auto-maintained by the Intelligent Health Monitoring System (IHMS).

## Last Sync
- Timestamp: 2026-06-28
- Triggering task: Implement + VERIFY Person 1 backend end-to-end on real Neon DB + live API.

## Structural Integrity — Person 1 VERIFIED GREEN ✅
- `npm run test:logic` → 15/15 pass (retry helpers + extraction + all routing branches).
- `npm run test:api` → PASS (live PCC, survived 30% 429s; ID mapping correct).
- `npm run db:push` → tables created on Neon. ✅
- `npm run ingest -- --facility 101 --limit 10 --once` → 10 patients ingested (resumable slice). ✅
- `npm run verify` → 4 auto / 6 flag / 7 reject on real data; PHI leak check PASS.
- `GET /api/eligibility` (next dev) → HTTP 200, exact `EligibilityResult` keys, filters work, no PHI leak. ✅
- Env: secrets live in `.env` (NOT `.env.local`). DATABASE_URL = Neon. PCC_BASE_URL set.
- Not yet: `npm run build` (prod), full 300-patient backfill (only 17 ingested so far).

## Documentation Alignment
- `plan.md` = source of truth; Person 1 micro-tasks checked off. ✅
- `ARCHITECTURE.md` mirrors plan.md. ✅
- `wiki.md` code layout reflects real files. ✅
- `README.md` / `API.md`: source docs, unchanged.

## Open Risks / Warnings
- `lib/extract/index.ts` is a FUNCTIONAL STUB. Now parses real nested `sections`, narratives, labeled notes. Person 2 still owns de-id + LLM (Envive) + multi-wound + confidence tuning.
- Only 17 patients ingested (smoke). Run full backfill before demo (see plan.md Deploy & Run).
- Eligibility computed on-the-fly in `compute.ts` (no persisted `eligibility` table) — fine for 300.
- Design call: confirmed non-MCB → `reject`; missing coverage entirely → `flag` (missing≠negative).
- Critical path: Person 1 (done+verified) + Person 2 (extraction) gate the live demo.

## REAL-DATA GOTCHAS (API ≠ API.md docs — confirmed by ingest)
- Medicare Part B identified by `payer_code === "MCB"`, NOT `payer_type` (which is just "Medicare" for both A and B). Engine fixed.
- Assessment `raw_json` is nested `{sections:[{questions:[{question,answer}]}]}` or a free-text "Wound narrative" — NOT the flat shape in API.md. Extractor handles both.
- Narratives often omit depth → those `flag_for_review` (correct).
- Next env precedence: `.env.local` > `.env`. An empty `.env.local` silently shadows `.env`. Keep secrets in `.env`, delete stray `.env.local`.
- `@next/swc-darwin-arm64` must NOT be a hard dependency (breaks Vercel Linux build).

## Recent State Changes
| Timestamp | Task | Files Touched | Result |
|-----------|------|---------------|--------|
| 2026-06-28 | IHMS bootstrap | plan.md, selfcorrection.md, system_health.md, wiki.md | created |
| 2026-06-28 | 3-person plan + sync prompt + deploy steps | plan.md, selfcorrection.md, system_health.md, wiki.md | updated |
| 2026-06-28 | Reconcile ARCHITECTURE.md → 3-person | ARCHITECTURE.md, wiki.md, system_health.md | updated |
| 2026-06-28 | Implement Person 1 backend | 20 new files (lib/*, app/api/*, scripts/*, config) | created |
