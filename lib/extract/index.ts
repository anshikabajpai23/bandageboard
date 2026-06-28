// ===========================================================================
// FUNCTIONAL STUB — Person 2 owns the production version of this module.
// ---------------------------------------------------------------------------
// Exists so Person 1's pipeline (eligibility + API) produces real output before
// the full extractor lands. Handles the shapes actually returned by the API:
//   - assessment raw_json with nested `sections[].questions[]`  (structured)
//   - assessment "Wound narrative" free text                    (prose)
//   - assessment flat {wound_type, length_cm, ...}              (docs/fixtures)
//   - progress notes (labeled SPN + prose "Measures A x B cm")
// Returns null when nothing wound-like is found (e.g. pure Envive narrative
// with no measurements) -> those correctly flag_for_review.
//
// Person 2: replace this. Add de-identification, an LLM path for Envive,
// multi-wound primary selection, evidence offsets, and confidence tuning.
// Keep the signature stable: extractWound(source) -> ExtractedWound | null
// ===========================================================================

import type {
  Assessment,
  DrainageAmount,
  ExtractedWound,
  Note,
} from "../types";

type Source =
  | { kind: "assessment"; data: Assessment }
  | { kind: "note"; data: Note };

const WOUND_TYPES: [RegExp, string][] = [
  [/pressure (ulcer|injury)/i, "pressure_ulcer"],
  [/diabetic|dfu/i, "diabetic_foot_ulcer"],
  [/venous/i, "venous_stasis_ulcer"],
  [/arterial/i, "arterial_ulcer"],
  [/surgical site|surgical wound/i, "surgical_site_infection"],
  [/abscess/i, "abscess"],
  [/\bburn\b/i, "burn"],
];

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function matchType(s: string | null | undefined): string | null {
  if (!s) return null;
  for (const [re, t] of WOUND_TYPES) if (re.test(s)) return t;
  return null;
}

function normStage(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /(\d|unstageable)/i.exec(s);
  if (!m) return null;
  if (/n\/?a/i.test(s)) return null;
  return m[1].toLowerCase() === "unstageable" ? "unstageable" : m[1];
}

function normDrainage(s: string | null | undefined): DrainageAmount | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (/\bnone|absent|no drainage\b/.test(t)) return "none";
  if (/heavy|large|copious|profuse/.test(t)) return "heavy";
  if (/mod(erate)?/.test(t)) return "moderate";
  if (/light|scant|minimal|\bmin\b|small/.test(t)) return "light";
  return null;
}

interface Partial {
  wound_type: string | null;
  stage: string | null;
  location: string | null;
  length_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  drainage_amount: DrainageAmount | null;
}

/** Parse a free-text / labeled clinical string into wound fields. */
function parseText(text: string): Partial {
  const labeled = (label: string) =>
    new RegExp(`${label}\\s*:?\\s*([^\\n/]+)`, "i").exec(text)?.[1]?.trim() ?? null;
  const cm = (label: string) =>
    num(new RegExp(`${label}\\s*:?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*cm`, "i").exec(text)?.[1] ?? null);

  // Dimensions: "Measures 2.9 cm x 2.8 cm" / "5.9 x 4.5cm" / "...x 1.8 cm" / "depth 1.8cm".
  const trip = /([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?(?:\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*cm)?/i.exec(text);
  const length_cm = cm("Length") ?? num(trip?.[1]);
  const width_cm = cm("Width") ?? num(trip?.[2]);
  const depth_cm =
    cm("Depth") ??
    num(trip?.[3]) ??
    num(/depth[:\s]+([0-9]+(?:\.[0-9]+)?)\s*cm/i.exec(text)?.[1] ?? null) ??
    num(/([0-9]+(?:\.[0-9]+)?)\s*cm\s*deep/i.exec(text)?.[1] ?? null);

  // Location: "to Right hip /" or labeled "Location: Sacrum".
  const loc =
    labeled("Location") ??
    /\bto\s+([A-Za-z][A-Za-z ]+?)\s*(?:\/|measures|,|\.|$)/i.exec(text)?.[1]?.trim() ??
    null;

  return {
    wound_type: matchType(labeled("Wound Type")) ?? matchType(text),
    stage: normStage(/stage\s*:?\s*([^/\n,]+)/i.exec(text)?.[1] ?? null),
    location: loc,
    length_cm,
    width_cm,
    depth_cm,
    drainage_amount: normDrainage(labeled("Drainage")) ?? normDrainage(text),
  };
}

function empty(p: Partial): boolean {
  return !p.wound_type && p.length_cm == null && p.width_cm == null;
}

function fromAssessment(a: Assessment): ExtractedWound | null {
  if (!a.raw_json) return null;
  let j: any;
  try {
    j = JSON.parse(a.raw_json);
  } catch {
    return null;
  }

  // Flat docs/fixture shape.
  if (j.wound_type !== undefined || j.length_cm !== undefined) {
    const p = parseText("");
    return mk(a.patient_id, {
      ...p,
      wound_type: matchType(String(j.wound_type ?? "")) ?? (j.wound_type ?? null),
      stage: j.stage != null ? normStage(String(j.stage)) ?? String(j.stage) : null,
      location: j.location ?? null,
      length_cm: num(j.length_cm),
      width_cm: num(j.width_cm),
      depth_cm: num(j.depth_cm),
      drainage_amount: normDrainage(String(j.drainage_amount ?? "")),
    }, "assessment", 0.95, `assessment#${a.id} (flat)`);
  }

  // Nested sections shape.
  if (Array.isArray(j.sections)) {
    const qa = new Map<string, string>();
    for (const s of j.sections) {
      for (const q of s.questions ?? []) {
        if (q?.question) qa.set(String(q.question).toLowerCase(), String(q.answer ?? ""));
      }
    }
    const narrative = qa.get("wound narrative");
    if (narrative) {
      const p = parseText(narrative);
      if (empty(p)) return null;
      return mk(a.patient_id, p, "assessment", 0.65, `assessment#${a.id} narrative`);
    }
    // Structured Q&A fields.
    const get = (k: string) => qa.get(k) ?? null;
    const p: Partial = {
      wound_type: matchType(get("wound type")),
      stage: normStage(get("stage")),
      location: get("location"),
      length_cm: num(get("length (cm)") ?? get("length")),
      width_cm: num(get("width (cm)") ?? get("width")),
      depth_cm: num(get("depth (cm)") ?? get("depth")),
      drainage_amount: normDrainage(get("drainage amount") ?? get("drainage")),
    };
    if (empty(p)) return null;
    return mk(a.patient_id, p, "assessment", 0.9, `assessment#${a.id} structured`);
  }

  return null;
}

function fromNote(n: Note): ExtractedWound | null {
  const t = n.note_text ?? "";
  const p = parseText(t);
  if (empty(p)) return null; // pure narrative w/ no measures -> defer (Person 2 LLM)
  return mk(n.patient_id, p, "note_structured", 0.6, `note#${n.id}`);
}

function mk(
  patient_id: number,
  p: Partial,
  source: ExtractedWound["source"],
  confidence: number,
  evidence: string
): ExtractedWound {
  return { patient_id, ...p, source, confidence, is_primary: true, evidence };
}

/** Extract a wound from a single source. Returns null when unparseable. */
export function extractWound(source: Source): ExtractedWound | null {
  return source.kind === "assessment"
    ? fromAssessment(source.data)
    : fromNote(source.data);
}
