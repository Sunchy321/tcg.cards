/** Display sort order of banlist statuses (ported from the legacy static data). */
export const banlistStatusOrder = [
  'banned',
  'banned_in_bo1',
  'suspended',
  'banned_as_commander',
  'banned_as_companion',
  'restricted',
  'score',
  'game_changer',
  'legal',
  'unavailable',
] as const;

/** Display sort order of banlist group sources; null sorts last = ordinary authored bans. */
export const banlistSourceOrder = ['ante', 'offensive', 'conspiracy', 'unfinity', 'legendary', null] as const;
