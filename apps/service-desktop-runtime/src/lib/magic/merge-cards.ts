/**
 * Oracle pairs that share one printed identity and project as ONE card: the
 * only such card is B.F.M. (Big Furry Monster), two physical halves forming a
 * single spread. Match assigns both members the group slug; assembly builds
 * one merged card whose prints stay the raw halves.
 */
export interface CardMergeGroup {
  /** Natural name slug shared by every member (also the merged cardId). */
  slug:            string;
  /** Member whose oracle id represents the merged card (the left half). */
  primaryOracleId: string;
  /** All member oracle ids. */
  memberOracleIds: string[];
  /** Merged card-level face fields that cannot be derived from one half. */
  face: {
    typeLine:   string;
    oracleText: string;
  };
}

export const cardMergeGroups: CardMergeGroup[] = [
  {
    slug:            'b-f-m-big-furry-monster',
    primaryOracleId: '8fd7503b-e722-49a7-a8ac-786e7354bc95',
    memberOracleIds: [
      '8fd7503b-e722-49a7-a8ac-786e7354bc95',
      'd0bd00f2-91bb-4c9c-a8e7-f8aeadc0bbb9',
    ],
    // The rules text is printed across the two-card spread and the halves'
    // line breaks do not align (the left card holds line 2 alone), so the
    // merged text cannot be derived by pairing lines — it is spelled out.
    face: {
      typeLine:   'Creature — The Biggest, Baddest, Nastiest, Scariest Creature You\'ll Ever See',
      oracleText: 'You must cast both B.F.M. cards to put B.F.M. onto the battlefield. If one B.F.M. card leaves the battlefield, sacrifice the other.\nB.F.M. can\'t be blocked except by three or more creatures.',
    },
  },
];

/** Merge group containing `oracleId`, if any. */
export function findCardMergeGroup(oracleId: string): CardMergeGroup | null {
  return cardMergeGroups.find(g => g.memberOracleIds.includes(oracleId)) ?? null;
}
