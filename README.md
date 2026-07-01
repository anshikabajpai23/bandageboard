# BandageBoard

**Medicare Part B wound-care billing triage dashboard** — built for the ABI Frameworks Hackathon.

BandageBoard ingests patient data from a mock PointClickCare (PCC) EHR API, extracts wound details from clinical notes and structured assessments, and routes each patient to a biller decision in real time: **auto-accept**, **flag for review**, or **reject**.
<img width="1283" height="671" alt="Screenshot 2026-06-30 at 10 45 30 PM" src="https://github.com/user-attachments/assets/d7bdbc6b-90b5-4a1b-b851-fec324849468" />

---

## Features

- **Resumable chunked ingestion** — pulls 300 patients across 3 facilities with `Retry-After`-aware exponential backoff (handles the API's 30% synthetic 429 rate); idempotent upserts mean any interrupted run can pick up where it left off
- **Multi-format wound extraction** — regex parsers for SOAP/prose/structured notes; optional LLM upgrade (Claude claude-opus-4-8) for hard Envive narratives, with PHI stripped before any API call
- **Multi-wound support** — deduplicates wounds seen in both a note and an assessment; keeps distinct wounds separate; primary = largest area
- **Deterministic rules engine** — coverage → healed-language detection → active wound check → conflict/confidence/missing-fields → `auto_accept` / `flag_for_review` / `reject` + plain-English reason, all without an LLM
- **Manual decision override** — billers can override any wound's routing decision from the detail drawer; overrides persist across re-syncs and are fully reversible with an audit trail
- **"Why this decision?" LLM explanation** — streaming Claude summary per wound on demand
- **PDF export** — print-ready patient detail sheet generated client-side (no server round-trip)
- **Dashboard** — color-coded table, facility/decision/payer filters, summary stat cards, clickable detail drawer per patient

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | Vercel Postgres (Neon) via Drizzle ORM |
| LLM | Anthropic claude-opus-4-8 (extraction + summaries) |
| UI | Tailwind CSS + custom components |
| Deploy | Vercel |

---

## Project Structure

```
app/
  api/
    eligibility/        # GET (list with filters), POST/DELETE (overrides)
    summarize/          # Streaming LLM "why this decision?" endpoint
    sync/               # Trigger data ingestion
  page.tsx              # Dashboard entry point
  layout.tsx

components/
  Dashboard.tsx         # Main dashboard with filter state and data loading
  DetailDrawer.tsx      # Per-patient slide-over: wound cards, overrides, PDF
  EligibilityTable.tsx  # Color-coded sortable patient table
  SummaryCards.tsx      # Auto-accept / flag / reject count cards
  Charts.tsx            # Facility breakdown charts
  decision.ts           # Decision metadata (labels, colors, badges)

lib/
  types.ts              # Shared TypeScript contracts (Patient, WoundClaim, etc.)
  db/
    schema.ts           # Drizzle schema (patients, notes, assessments, overrides…)
    client.ts           # DB connection
  eligibility/
    engine.ts           # Pure rules engine — no DB, no network
    compute.ts          # Joins DB rows → EligibilityResult[]
    overrides.ts        # Per-wound override persistence
  extract/              # Wound extraction (regex + optional LLM)
  ingest/               # PCC API client with retry/backoff

scripts/
  ingest.ts             # One-shot full ingest (all facilities)
  test-logic.ts         # 22-case rules engine unit tests
  test-api.ts           # API integration tests
  test-llm.ts           # LLM extraction smoke tests
  verify.ts             # Data quality checks
```

---

## Decision Logic

The routing engine (`lib/eligibility/engine.ts`) runs these rules **in order** for every wound:

```
1. Coverage unavailable?          → flag_for_review
2. No active Medicare Part B?     → reject
3. Latest note says wound healed? → reject  (conflicting healed+active → flag)
4. No wound extracted?
   └─ No clinical source at all?  → reject
   └─ Extraction failed?          → flag_for_review
5. Note/assessment conflict?      → flag_for_review
6. Confidence < 75%?              → flag_for_review
7. Missing required fields?       → flag_for_review   (missing ≠ negative)
8. All fields present, confident, unconflicted → auto_accept
```

Multi-wound patients: each wound gets its own decision. The patient-level decision mirrors the primary wound (`wounds[0]`, largest area).

See [`threshold.md`](./threshold.md) for the full team contract behind these rules.

---

## Routing Decisions

| Decision | Meaning |
|---|---|
| `auto_accept` | All required fields documented, confident, unconflicted — safe to route to billing |
| `flag_for_review` | Data ambiguous, incomplete, or conflicting — biller should review |
| `reject` | Clear negative evidence (no MCB, wound healed/resolved, no wound at all) |

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Vercel Postgres database (or any Postgres connection string)
- Anthropic API key (for LLM extraction/summaries — optional if `EXTRACT_USE_LLM` is false)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file:

```env
# Vercel Postgres connection
POSTGRES_URL="postgres://..."

# PCC mock API
PCC_API_BASE="https://hackathon.prod.pulsefoundry.ai"
PCC_API_KEY="your-api-key"

# Anthropic (optional — set to "true" to enable LLM extraction)
ANTHROPIC_API_KEY="sk-ant-..."
EXTRACT_USE_LLM="false"
```

### 3. Push the database schema

```bash
npx drizzle-kit push
```

### 4. Ingest patient data

```bash
npm run ingest
```

This fetches all 300 patients across facilities 101/102/103, handles 429 rate limits automatically, and upserts into Postgres. Safe to re-run — idempotent.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run ingest` | Full data ingest from PCC API |
| `npm run test:logic` | Run 22-case rules engine tests |
| `npm run test:api` | API integration tests |
| `npm run test:llm` | LLM extraction smoke test |
| `npm run verify` | Data quality checks on current DB contents |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |

---

## Manual Override

Billers can override any wound's routing decision directly from the detail drawer:

1. Click any patient row to open the drawer
2. Each wound card has **Mark ready to bill / Flag for review / Reject** buttons
3. Add an optional note explaining the change (e.g. "Verified MCB by phone 6/28")
4. Click **Revert** to restore the system's original decision

Overrides persist across re-syncs (stored in a separate `decision_overrides` table untouched by ingestion) and are fully auditable — the system's original decision and reason are always preserved alongside the override.

---

## PHI Handling

- All LLM calls receive de-identified text only — names, DOB, and patient IDs are stripped before sending to Anthropic
- Patient identifiers in the UI display only what is needed for billing workflow
- No PHI is logged to console or error traces

---
