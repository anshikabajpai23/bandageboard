# Wound-Care Billing Pipeline — Architecture & Task Split

**Team:** 4 developers · **Deploy target:** Vercel · **Duration:** Hackathon session

---

## 1. What we're building

An **internal, biller-facing** tool. The end user is a non-technical billing/revenue-cycle staffer who reviews a table of patients and decides which Medicare Part B wound-care claims to submit. Patients never see this.

Output: one row per patient with extracted wound fields, an active-MCB flag, and a routing decision (`auto_accept` / `flag_for_review` / `reject`) plus a plain-English reason — shown in a dashboard.

**PHI is treated as if real**, even though the hackathon data is synthetic. This is a cross-cutting requirement, not one person's job (see §5).

---

## 2. Tech stack (Vercel-native)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router) + TypeScript** | First-class Vercel support; API routes + frontend in one repo |
| Storage | **Vercel Postgres** (Neon) — or Supabase Postgres | Queryable, serverless, zero-config on Vercel |
| ORM | **Drizzle** (or Prisma) | Type-safe schema = our shared contract |
| Ingestion trigger | **Vercel Cron** → serverless route | Scheduled + incremental sync via `since` |
| LLM | **Vercel AI SDK** (Anthropic/OpenAI) | Only for hard-to-parse Envive narratives |
| UI | **Tailwind + shadcn/ui** | Fast, clean biller dashboard |
| Auth (stub) | Assume authenticated/authorized biller | PHI access control placeholder |

> **Vercel timeout note:** ingesting 300 patients × 5 endpoints with a 30% 429 rate is too much for one serverless invocation (10–60s limits). Ingestion must run **chunked** (per-facility or per-patient batches) with **idempotent upserts**, so a cron run can do a slice and the next run continues. Person 1 owns this.

---

## 3. Architecture

```
                          PCC Mock API (rate-limited, 30% 429)
                                      │
              ┌───────────────────────┼───────────────────────┐
              │              [1] INGESTION LAYER               │
              │  API client w/ retry+backoff · id↔patient_id   │
              │  resolution · chunked upserts · `since` sync   │
              └───────────────────────┬───────────────────────┘
                                      ▼
                          ┌───────────────────────┐
                          │   Vercel Postgres      │  ← schema = shared contract
                          │  patients, diagnoses,  │
                          │  coverage, notes,      │
                          │  assessments           │
                          └───────────┬───────────┘
                                      ▼
              ┌───────────────────────┴───────────────────────┐
              │           [2] EXTRACTION + DE-ID               │
              │  de-identify → parse (regex) / LLM (Envive) →  │
              │  normalized ExtractedWound + confidence        │
              └───────────────────────┬───────────────────────┘
                                      ▼
              ┌───────────────────────┴───────────────────────┐
              │        [3] ELIGIBILITY ENGINE + API            │
              │  active MCB? · active wound? · measurements    │
              │  complete? → routing + reason · Next API routes│
              │  PHI masking enforced at API boundary          │
              └───────────────────────┬───────────────────────┘
                                      ▼
              ┌───────────────────────┴───────────────────────┐
              │           [4] BILLER DASHBOARD                 │
              │  color-coded table · filters · detail drawer · │
              │  masked identifiers + reveal · summary stats   │
              └────────────────────────────────────────────────┘
```

---

## 4. The shared contract (BUILD THIS FIRST, together — ~30 min)

Before splitting, the whole team agrees on the DB schema + TypeScript types. This is the seam that lets all 4 work in parallel against mocks. Define these interfaces in `/lib/types.ts`:

```ts
// Raw entities (mirror the API)
Patient { id:number; patient_id:string; facility_id:number;
          first_name; last_name; birth_date; gender; primary_payer_code;
          last_modified_at; is_new_admission }
Diagnosis { patient_id:string; icd10_code; icd10_description;
            clinical_status; onset_date }
Coverage { patient_id:string; payer_code; payer_type;
           effective_from; effective_to }
Note { id; patient_id:number; note_type; effective_date; note_text }
Assessment { id; patient_id:number; assessment_type;
             assessment_date; raw_json }

// THE integration interface — extraction & routing & UI all depend on this
ExtractedWound {
  patient_id:number;
  wound_type; stage; location;
  length_cm; width_cm; depth_cm;
  drainage_amount: 'none'|'light'|'moderate'|'heavy';
  source: 'assessment'|'note_structured'|'note_llm';
  confidence: number;        // drives routing
  is_primary: boolean;       // for multi-wound notes
}

EligibilityResult {
  patient_id:string; display_name_masked:string; facility_id:number;
  has_active_mcb:boolean;
  wound: ExtractedWound | null;
  decision: 'auto_accept'|'flag_for_review'|'reject';
  reason:string;
}
```

Also commit a `/lib/mocks.ts` with 5–10 fake `EligibilityResult` rows so **Person 3 and 4 can start immediately** without waiting on real data.

---

## 5. PHI rules (everyone follows these)

- **De-identify before any LLM call** — strip name/DOB/patient IDs from note text, run extraction on clinical text only, re-attach identifiers locally. (Person 2 builds the module; Person 3 uses it for summaries.)
- **Mask in the UI** — show last name + patient ID by default; reveal toggle for authorized use. (Person 4)
- **Minimize storage** — keep only fields needed for the decision; don't duplicate full notes downstream. (Person 1 & 2)
- **No PHI in logs** — never log full note text, names, or DOB to console/error traces. (Everyone)
- **API masks at the boundary** — `display_name_masked` is what leaves the server. (Person 3)

---

## 6. The 4 parallel workstreams

### Person 1 — Ingestion & Data Layer  `/lib/ingest`, `/app/api/sync`
Owns the DB schema (the contract). Deliverables:
- API client: `Retry-After`-aware retry/backoff for 429; handle 422/500 cleanly.
- Resolve `patient_id` (string) ↔ `id` (int); fetch all 5 entity types per patient.
- Chunked, idempotent upserts into Postgres (resumable across cron runs).
- Vercel Cron config; **bonus:** incremental `since` sync.
- Provides: populated DB + a `getRawData()` accessor.

### Person 2 — Extraction & De-identification (PHI core)  `/lib/extract`
The hardest accuracy work. Deliverables:
- **De-id module** (also used by Person 3): tokenize identifiers ↔ restore.
- Structured parser (regex) for SOAP / SPN / prose shorthand (`Meas 4.2x3.1x1.5cm`).
- Assessment `raw_json` parser (cleanest source — prefer it when present).
- **LLM extractor** for Envive narratives on de-identified text.
- Multi-wound → pick primary; emit `confidence`.
- Provides: `extractWound(note|assessment) → ExtractedWound`.

### Person 3 — Eligibility Engine & API  `/lib/eligibility`, `/app/api/*`
The decision logic + server boundary. Deliverables:
- Active **MCB** check (coverage with `effective_to = null`); active wound check (diagnoses + extraction).
- Routing rules → `auto_accept` (all fields clear), `flag_for_review` (ambiguous/Envive/low confidence), `reject` (no reliable extraction) + reason generator.
- **Bonus:** per-patient LLM summary narrative (de-identified).
- Next.js API routes: `GET /api/eligibility` (+ filters by facility/decision/payer); enforce PHI masking here.
- Provides: the `EligibilityResult[]` the UI renders.

### Person 4 — Biller Dashboard  `/app`, `/components`
The presentation + visual output (judged). Deliverables:
- Table: color-coded by decision, sortable, filter by facility / decision / payer.
- Summary cards: counts per decision, % auto-accepted, payer mix.
- Patient detail drawer: wound fields, reason, masked identifiers + reveal toggle.
- Empty/loading/error states; deploy + Vercel config.
- Works against `/lib/mocks.ts` from minute one, swaps to live API when ready.

---

## 7. Integration plan

1. **Phase 0 (together):** agree schema + types + commit mocks. ← unblocks everyone.
2. **Phase 1 (parallel):** each person builds against the contract / mocks.
3. **Phase 2 (integrate):** 1→2 (real data into extraction), 2→3 (extractions into routing), 3→4 (real API into UI). Swap mocks for live in order.
4. **Phase 3 (demo prep):** pick 3–4 example patients (one per decision type), rehearse the 10-min biller walkthrough.

**Critical path:** Person 1 (data) → Person 2 (extraction) gate the live demo, so they integrate first. Persons 3 & 4 stay productive on mocks throughout, so a slow ingest never blocks the UI.
