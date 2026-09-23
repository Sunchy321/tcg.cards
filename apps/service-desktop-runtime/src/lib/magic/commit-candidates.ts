import {
  isArtBackDoubleFacedToken,
  isSingleCardDoubleFacedToken,
} from './match';
import { normalizeMtgchText } from './project/assemble';

/**
 * Print-commit candidate logic that is pure by construction: turning MTGCH
 * position rows into commit face slots, and deciding which candidate oracles
 * the commit path can actually synthesize. The oRPC handlers run the
 * database diff; these decisions are what the offline tests pin.
 */

/** Raw face-slot inputs of one MTGCH position, as the join returns them. */
export interface CandidateFaceRow {
  faceIndex: number | null;
  faceName:  string | null;
  name:      string | null;
  typeLine:  string | null;
  text:      string | null;
}

/**
 * Builds the commit face slots for one candidate position, aligned with the
 * oracle's face count. Per-face MTGCH rows feed multi-face cards by index; a
 * whole-card row (faceIndex < 0) feeds a single face. The per-face name wins
 * over the joined whole-card name, MTGCH newline escapes normalize, and a
 * slot with no asserted content stays empty so the projection's baseline
 * cloning covers it.
 */
export function buildCandidateFaces(rows: CandidateFaceRow[], faceCount: number): Array<Record<string, string>> {
  const slots: Array<Record<string, string>> = Array.from({ length: faceCount }, () => ({}));
  const faceRows = rows.filter(r => r.faceIndex != null && r.faceIndex >= 0);
  const wholeRow = rows.find(r => r.faceIndex == null || r.faceIndex < 0);

  let picked: Array<CandidateFaceRow | null>;
  if (faceRows.length === faceCount && faceCount > 0) {
    picked = Array.from({ length: faceCount }, (_, i) => faceRows.find(r => r.faceIndex === i) ?? null);
  } else if (faceCount === 1 && wholeRow != null) {
    picked = [wholeRow];
  } else if (faceRows.length > 0) {
    // Index mismatch between MTGCH rows and oracle faces: take the rows by
    // their own index where they fit, leaving the rest to the baseline clone.
    picked = slots.map((_, i) => faceRows.find(r => r.faceIndex === i) ?? null);
  } else {
    picked = slots.map(() => null);
  }

  return picked.map((row, i) => {
    if (row == null) return slots[i]!;
    const name = normalizeMtgchText(present(row.faceName) ? row.faceName : row.name);
    const typeline = normalizeMtgchText(row.typeLine);
    const text = normalizeMtgchText(row.text);
    const slot = slots[i]!;
    if (name != null) slot.printedName = name;
    if (typeline != null) slot.printedTypeLine = typeline;
    if (text != null) slot.printedText = text;
    return slot;
  });
}

function present(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/** English card facts the eligibility decision needs. */
export interface CandidateCardFacts {
  layout:    string;
  name:      string;
  cardFaces: Array<{ name?: string, oracle_text?: string | null, power?: string | null, toughness?: string | null }> | null;
}

/**
 * Whether the commit path can synthesize prints for this oracle at all. The
 * branches the projection skips — reversible cards (no unit of their own),
 * art-back tokens and split double-faced tokens (face-suffix units) — would
 * hold a commit forever unprojected, so candidates never offer them.
 */
export function candidateOracleEligible(card: CandidateCardFacts): boolean {
  if (card.layout === 'reversible_card') return false;
  if (card.layout === 'double_faced_token') {
    const names = cardFacesNames(card);
    const faces = card.cardFaces ?? [];
    if (isArtBackDoubleFacedToken(names, faces.map(f => ({
      oracleText: f.oracle_text ?? null,
      power:      f.power ?? null,
      toughness:  f.toughness ?? null,
    })))) return false;
    if (!isSingleCardDoubleFacedToken(names)) return false;
  }
  return true;
}

function cardFacesNames(card: CandidateCardFacts): string[] {
  const faces = card.cardFaces ?? [];
  if (faces.length === 0) return [card.name];
  return faces.map(f => f.name ?? '');
}

/** Face count of the oracle, for face-slot alignment. */
export function candidateFaceCount(card: CandidateCardFacts): number {
  const faces = card.cardFaces ?? [];
  return faces.length === 0 ? 1 : faces.length;
}
