// Maps Hearthstone set ids to local set icon assets.
export const hearthstoneSetIcons: Record<string, string> = {
  CORE:      '/icons/hearthstone/sets/core.png',
  SET_3:    '/icons/hearthstone/sets/classic.png',
  SET_12:   '/icons/hearthstone/sets/naxxramas.png',
  SET_13:   '/icons/hearthstone/sets/goblins-vs-gnomes.png',
  SET_14:   '/icons/hearthstone/sets/blackrock-mountain.png',
  SET_15:   '/icons/hearthstone/sets/grand-tournament.png',
  SET_20:   '/icons/hearthstone/sets/league-of-explorers.png',
  SET_21:   '/icons/hearthstone/sets/old-gods.png',
  SET_23:   '/icons/hearthstone/sets/karazhan.png',
  SET_25:   '/icons/hearthstone/sets/gadgetzan.png',
  SET_27:   '/icons/hearthstone/sets/ungoro.png',
  SET_1001: '/icons/hearthstone/sets/frozen-throne.png',
  SET_1004: '/icons/hearthstone/sets/kobolds-catacombs.png',
  SET_1125: '/icons/hearthstone/sets/witchwood.png',
  SET_1127: '/icons/hearthstone/sets/boomsday.png',
  SET_1129: '/icons/hearthstone/sets/rastakhan.png',
  SET_1130: '/icons/hearthstone/sets/rise-of-shadows.png',
  SET_1158: '/icons/hearthstone/sets/uldum.png',
  SET_1347: '/icons/hearthstone/sets/descent-of-dragons.png',
  SET_1403: '/icons/hearthstone/sets/galakrond-awakening.png',
  SET_1414: '/icons/hearthstone/sets/ashes-of-outland.png',
  SET_1443: '/icons/hearthstone/sets/scholomance.png',
  SET_1466: '/icons/hearthstone/sets/darkmoon-faire.png',
  SET_1525: '/icons/hearthstone/sets/barrens.png',
  SET_1578: '/icons/hearthstone/sets/stormwind.png',
  SET_1626: '/icons/hearthstone/sets/alterac.png',
  SET_1635: '/icons/hearthstone/sets/legacy.png',
  SET_1637: '/icons/hearthstone/sets/core.png',
  SET_1646: '/icons/hearthstone/sets/classic.png',
  SET_1658: '/icons/hearthstone/sets/sunken-city.png',
  SET_1691: '/icons/hearthstone/sets/nathria.png',
  SET_1776: '/icons/hearthstone/sets/march-lich-king.png',
  SET_1809: '/icons/hearthstone/sets/festival-legends.png',
  SET_1858: '/icons/hearthstone/sets/titans.png',
  SET_1892: '/icons/hearthstone/sets/badlands.png',
  SET_1897: '/icons/hearthstone/sets/whizbang-workshop.png',
  SET_1898: '/icons/hearthstone/sets/caverns-of-time.png',
  SET_1905: '/icons/hearthstone/sets/perils-paradise.png',
  SET_1935: '/icons/hearthstone/sets/great-dark-beyond.png',
  SET_1946: '/icons/hearthstone/sets/emerald-dream.png',
  SET_1952: '/icons/hearthstone/sets/lost-city-ungoro.png',
  SET_1957: '/icons/hearthstone/sets/across-timeways.png',
  SET_1980: '/icons/hearthstone/sets/cataclysm.png',
};

const coloredSetIcons = new Set([
  'SET_1158',
  'SET_1658',
  'SET_1957',
  'SET_1980',
]);

// Returns the local public URL for a known Hearthstone set icon.
export function hearthstoneSetIconUrl(set: string) {
  return hearthstoneSetIcons[set] ?? null;
}

// Classifies icon artwork so colored temporary assets keep their original palette.
export function hearthstoneSetIconTone(set: string) {
  return coloredSetIcons.has(set) ? 'color' : 'mono';
}
