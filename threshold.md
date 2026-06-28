# Threshold Rules for Wound Care Billing Triage

## Core Principle

This system should be treated as a **conservative healthcare billing triage system**, not a final billing decision engine.

The goal is not to maximize the number of patients sent to billing. The goal is to make sure that **no patient is confidently routed unless the evidence is complete, current, and traceable**.

> If the system cannot prove eligibility safely, it must route the patient to `flag_for_review`.

---

## Decision Thresholds

| Decision | Threshold |
|---|---|
| `auto_accept` | All required fields are present, current, non-conflicting, and evidence-backed. |
| `flag_for_review` | Patient may be eligible, but one or more required items are missing, vague, conflicting, low-confidence, or incomplete due to API failure. |
| `reject` | Clear negative evidence exists, such as no active Medicare Part B, no active wound evidence, or latest documentation says the wound is resolved/healed. |

---

## Auto-Accept Requirements

A patient should be `auto_accept` only when **all** of the following are true:

| Requirement | Required for Auto-Accept? |
|---|---|
| Correct patient identity matched across all data sources | Yes |
| Active Medicare Part B coverage | Yes |
| Current active wound documented in note or assessment | Yes |
| Wound type documented | Yes |
| Wound location documented | Yes |
| Length documented | Yes |
| Width documented | Yes |
| Depth documented | Yes |
| Drainage documented as none / light / moderate / heavy | Yes |
| Stage documented if wound is a pressure ulcer | Yes |
| No conflict between notes, assessments, diagnoses, and coverage | Yes |
| Evidence snippet available for key extracted fields | Yes |

If any required item is missing, unclear, or conflicting, do **not** auto-accept.

---

## Flag-for-Review Threshold

Use `flag_for_review` when the patient could be eligible, but the system cannot prove it safely.

Common reasons to flag:

| Situation | Decision |
|---|---|
| Active Medicare Part B exists, but measurements are incomplete | `flag_for_review` |
| Active Medicare Part B exists, but drainage is vague or missing | `flag_for_review` |
| Wound ICD code exists, but current wound documentation is incomplete | `flag_for_review` |
| Notes and assessments conflict | `flag_for_review` |
| Multiple wounds exist and primary wound is unclear | `flag_for_review` |
| API call failed or returned incomplete data after retries | `flag_for_review` |
| LLM or parser confidence is low | `flag_for_review` |
| Latest documentation is unclear about whether wound is active or healed | `flag_for_review` |

Important rule:

> Missing data is not the same as negative evidence.

If an API call fails, a field is missing, or extraction is uncertain, the patient should be flagged for review instead of rejected.

---

## Reject Threshold

Use `reject` only when there is clear evidence that the patient should not enter the Medicare Part B wound billing workflow.

| Situation | Decision |
|---|---|
| No active Medicare Part B coverage | `reject` |
| Medicare Part A, Medicaid, HMO, or other non-Part B coverage only | `reject` |
| No active wound evidence in diagnoses, notes, or assessments | `reject` |
| Latest documentation clearly says the wound is healed or resolved | `reject` |
| Extraction is not possible and there is no reliable wound evidence | `reject` |

Do not reject just because one API response is missing or one extraction field failed. In those cases, use `flag_for_review`.

---

## ICD Code Rule

ICD codes should be used as **supporting evidence only**.

They should help prioritize or support the clinical story, but they should not be used as the only proof for auto-accept.

| ICD Situation | Meaning | Decision Impact |
|---|---|---|
| Specific wound ICD code present | Strong supporting evidence | Helps confirm wound type |
| Diabetes, vascular disease, or venous insufficiency only | Risk factor, not wound proof | May increase review priority |
| Historical wound code only | Not proof of current active wound | Needs current note or assessment evidence |
| No wound ICD code, but note has clear active wound | Still possible | Use note/assessment evidence |
| Wound ICD code present, but no measurements or drainage | Incomplete documentation | `flag_for_review` |

Official rule for the team:

> ICD codes can support a decision, but current clinical documentation is the source of truth for wound details.

---

## Safety Rule for Wrong Labels

The most dangerous error is a **false auto-accept** or wrong patient routing.

Therefore, the algorithm should optimize for:

| Metric Goal | Meaning |
|---|---|
| High precision for `auto_accept` | Every auto-accepted patient should be clearly supported by evidence. |
| Low false auto-accepts | Avoid routing patients to billing when documentation is incomplete or incorrect. |
| Acceptable higher review count | It is safer to flag extra patients than to incorrectly auto-accept one. |

Team rule:

> Extra `flag_for_review` cases are acceptable. Wrong `auto_accept` cases are not acceptable.

---

## Proof and Validation Approach

We cannot honestly prove that the algorithm will never make a mistake. Instead, we prove that the system is designed to avoid unsafe confident decisions.

### 1. Evidence Traceability

Every `auto_accept` row must include evidence for:

- Active Medicare Part B coverage
- Active wound
- Wound type
- Location
- Length, width, depth
- Drainage
- Stage, if pressure ulcer

Each extracted field should be traceable to a note, assessment, diagnosis, or coverage record.

---

### 2. Manual Audit Sample

Before presenting, manually review examples from each bucket:

| Bucket | Suggested Audit Count |
|---|---:|
| `auto_accept` | 10 patients |
| `flag_for_review` | 10 patients |
| `reject` | 10 patients |

For each audited patient, verify:

- Correct patient ID mapping
- Correct coverage status
- Correct wound evidence
- Complete measurements
- Drainage documented
- Correct routing decision
- Clear plain-English reason

---

### 3. Dangerous Edge Case Tests

The pipeline should include tests for these cases:

| Test Case | Expected Result |
|---|---|
| Coverage API call fails | `flag_for_review` |
| Wound ICD present but no measurements | `flag_for_review` |
| Medicare Part A only | `reject` |
| HMO only | `reject` |
| Wound described as healed/resolved | `reject` or `flag_for_review` if conflicting |
| Drainage described vaguely, such as “some drainage” | `flag_for_review` |
| Note and assessment disagree on depth | `flag_for_review` |
| Multi-wound note with unclear primary wound | `flag_for_review` |
| Wrong patient ID mapping detected | Pipeline validation error |

---

## Final Team Rule

Use this as the team contract:

> `auto_accept` requires complete, current, non-conflicting, evidence-backed documentation.  
> `flag_for_review` is used whenever the patient may be eligible but the system cannot prove it safely.  
> `reject` is used only when there is clear evidence that the patient is not eligible.

In healthcare billing triage, flagging is not a failure. Flagging is the safety mechanism.
