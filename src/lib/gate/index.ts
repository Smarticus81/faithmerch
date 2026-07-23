import type { Check } from "@/lib/types";
import {
  checkAlphaHalo,
  checkInkCount,
  checkResolution,
  checkStrokeWeight,
  checkTrademark,
  checkTranslationLicense,
  checkVerseMatch,
  type GateInput,
} from "./checks";

export type { GateInput } from "./checks";
export { normalizeVerseText } from "./normalize";
export { lookupVerse, parseVerseRef, isCorpusTranslation } from "./corpus";

/**
 * Runs every quality check against a design. Deterministic — same input,
 * same checks[]. Runs after generation and its output is what disables
 * the approve button; there is no override path anywhere.
 */
export function runQualityGate(input: GateInput): Check[] {
  return [
    checkVerseMatch(input),
    checkTranslationLicense(input),
    checkResolution(input),
    checkAlphaHalo(input),
    checkStrokeWeight(input),
    checkInkCount(input),
    checkTrademark(input),
  ];
}
