// Phase 0 mocks so Person 3 (dashboard) starts at minute one, before the API
// is live. One row per decision type. Shape MUST match EligibilityResult.

import type { EligibilityResult } from "./types";

export const mockEligibility: EligibilityResult[] = [
  {
    patient_id: "FA-001",
    display_name_masked: "Dunbar (FA-001)",
    facility_id: 101,
    has_active_mcb: true,
    wound: {
      patient_id: 1,
      wound_type: "pressure_ulcer",
      stage: "2",
      location: "Sacrum",
      length_cm: 3.2,
      width_cm: 2.1,
      depth_cm: 0.4,
      drainage_amount: "moderate",
      source: "assessment",
      confidence: 0.95,
      is_primary: true,
      evidence: "Weekly Wound Information Sheet (assessment #20001)",
    },
    decision: "auto_accept",
    reason:
      "Active Medicare Part B. Pressure ulcer fully documented (type, stage 2, location, L/W/D, drainage). No conflicts.",
  },
  {
    patient_id: "FB-014",
    display_name_masked: "Okafor (FB-014)",
    facility_id: 102,
    has_active_mcb: true,
    wound: {
      patient_id: 113,
      wound_type: "diabetic_foot_ulcer",
      stage: null,
      location: "Left heel",
      length_cm: 2.5,
      width_cm: 1.8,
      depth_cm: null,
      drainage_amount: null,
      source: "note_structured",
      confidence: 0.6,
      is_primary: true,
      evidence: "Wound (SPN) note; depth and drainage not stated",
    },
    decision: "flag_for_review",
    reason:
      "Active Medicare Part B, but documentation incomplete: missing depth and drainage. Needs clinician review.",
  },
  {
    patient_id: "FC-007",
    display_name_masked: "Reyes (FC-007)",
    facility_id: 103,
    has_active_mcb: false,
    wound: null,
    decision: "reject",
    reason:
      "No active Medicare Part B coverage (HMO only). Not eligible for MCB wound-care billing.",
  },
];

export default mockEligibility;
