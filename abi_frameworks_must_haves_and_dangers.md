# ABI Frameworks Hackathon — Team Guardrails

This document contains the **non-negotiable requirements** for the project. Before implementing any feature or merging code, make sure these rules are satisfied.

---

# Must-Have Features

| Feature | Why it matters |
|---|---|
| Retry-safe API ingestion | Handle HTTP 429 using `Retry-After` and backoff. Never silently lose patient data. |
| Correct patient ID mapping | Use `patient_id` for `/coverage` and `/diagnoses`; use integer `id` for `/notes` and `/assessments`. |
| Raw + processed data storage | Keep raw API responses for auditability and processed tables for querying. |
| Active Medicare Part B validation | Only active Medicare Part B patients are eligible. |
| Wound extraction | Extract wound type, stage (if pressure ulcer), location, length, width, depth, and drainage from notes and assessments. |
| Rule-based routing | Use deterministic rules for `auto_accept`, `flag_for_review`, and `reject`. |
| Plain-English reason | Every routing decision must include a clear explanation. |
| Evidence snippets | Show exactly where each extracted field came from. |
| Missing documentation detection | Identify missing measurements, drainage, stage, or coverage instead of guessing. |
| Conflict detection | Detect disagreements between notes and assessments and send them for review. |
| Human review path | Any ambiguity or incomplete documentation should become `flag_for_review`. |
| Biller-friendly dashboard | Clear view of Ready, Needs Review, and Reject patients with filters. |

---

# Top 3 Dangers to Avoid

## 1. Wrong Patient Matching (Highest Priority)

**Risk:** Notes, coverage, or assessments are attached to the wrong patient.

**Prevention**
- Always use the correct identifier for each endpoint.
- Validate joins before processing.
- Never mix `patient_id` and integer `id`.

**Safe action:** If identity is uncertain → `flag_for_review`.

---

## 2. False Auto-Accept

**Risk:** Sending an ineligible or incompletely documented patient to billing.

**Auto-accept ONLY if all are true:**
- Active Medicare Part B confirmed
- Active wound confirmed
- Wound type documented
- Stage documented (if pressure ulcer)
- Location documented
- Length, width, and depth documented
- Drainage documented
- Evidence exists for extracted fields
- No unresolved conflicts

**Otherwise:** `flag_for_review`.

---

## 3. Treating Missing or Failed Data as Negative

**Risk:** API failures or extraction failures make an eligible patient appear ineligible.

**Never assume:**
- Missing coverage = No Medicare Part B
- Missing measurements = No measurements exist
- Failed extraction = Negative finding

**Safe action:** Missing, failed, conflicting, or unclear data → `flag_for_review`.

---

# Team Rule

> **Never guess. Auto-accept only when everything is clearly documented. If anything is unclear, use `flag_for_review`.**
