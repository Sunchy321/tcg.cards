/**
 * Rename annotations in Neuron card names. When a card was renamed, the site
 * appends the provenance to the displayed name — "(Updated from: Big Core)" in
 * English, localized equivalents elsewhere. The vocabulary is closed and the
 * annotation is always parenthesized at the end of the name.
 *
 * Matching by the keyword is required: real card names carry parentheses of
 * their own (the Recipe/Menu cycle, e.g. "Recette de Viande (Meat Recipe)"),
 * so a blanket trailing-parenthetical strip would corrupt them.
 */

/** The localized "renamed from" phrases, with the old name following the colon. */
const ANNOTATION_RE = /^(.*?)\s*\(((?:Updated from|Geändert von|Actualisé de|Actualizado de|Aggiornato da|Atualizado de)\s*:\s*.+)\)$/;

export interface SplitName {
  /** The name without its rename annotation. */
  name: string;
  /** The annotation's content ("Updated from: Big Core"), or null when absent. */
  annotation: string | null;
}

/** Splits a displayed card name from its trailing rename annotation, if any. */
export function splitNameAnnotation(displayedName: string): SplitName {
  const m = ANNOTATION_RE.exec(displayedName);
  if (!m) return { name: displayedName, annotation: null };
  return { name: m[1]!.trim(), annotation: m[2]!.trim() };
}
