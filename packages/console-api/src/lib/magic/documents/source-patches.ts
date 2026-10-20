// The original September 2024 TXT repeats the Offspring numbers for Impending.
// Match the whole five-paragraph sequence so unrelated text or revisions cannot be renumbered.
const impending = [
  "702.175. Offspring",
  "702.175a Offspring represents two abilities. “Offspring [cost]” means “You may pay an additional [cost] as you cast this spell” and “When this permanent enters, if its offspring cost was paid, create a token that’s a copy of it, except it’s 1/1.”",
  "702.175b If a spell has multiple instances of offspring, each is paid separately and triggers based on the payments made for it, not any other instances of offspring.",
  "702.175. Impending",
  "702.175a Impending is a keyword that represents four abilities. The first and second are static abilities that function while the spell with impending is on the stack. The third is a static ability that functions on the battlefield. The fourth is a triggered ability that functions on the battlefield. “Impending N—[cost]” means “You may choose to pay [cost] rather than pay this spell’s mana cost,” “If you chose to pay this spell’s impending cost, it enters with N time counters on it,” “As long as this permanent has a time counter on it, if it was cast for its impending cost, it’s not a creature,” and “At the beginning of your end step, if this permanent was cast for its impending cost and there is at least one time counter on it, remove a time counter from it.” Casting a spell for its impending cost follows the rules for paying alternative costs in rules 601.2b and 601.2f–h."
];

/** Restore the separately numbered Impending ability only in its verified defective edition. */
export function patchCrSource(versionTag: string, paragraphs: string[]): string[] {
  if (versionTag !== '20240920'
    || !paragraphs.includes('These rules are effective as of September 20, 2024.')
    || paragraphs.filter(paragraph => paragraph === impending[0]).length !== 1
    || paragraphs.some(paragraph => /^702\.176(?:[a-z]|\.)/.test(paragraph))) return paragraphs;
  const start = paragraphs.findIndex(paragraph => paragraph === impending[0]);
  if (start < 0 || !impending.every((paragraph, index) => paragraphs[start + index] === paragraph)) return paragraphs;
  return paragraphs.map((paragraph, index) => index === start + 3 ? '702.176. Impending'
    : index === start + 4 ? paragraph.replace(/^702\.175a /, '702.176a ') : paragraph);
}
