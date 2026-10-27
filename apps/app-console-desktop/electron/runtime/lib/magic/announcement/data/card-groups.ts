import { slugifyName } from '@tcg-cards/shared/magic/slug';

/**
 * Fixed sentinel-group card lists, ported verbatim from the legacy banlist
 * data. Entries are card names and are slugged with the same slugifyName the
 * import uses, so every id matches the cardId the card was imported under.
 * Conspiracy and pre-1995 legendary cards are not listed here: they are
 * computed from the database at projection time.
 */
const groupCardNames: Record<string, string[]> = {
  ante: [
    'Amulet of Quoz',
    'Bronze Tablet',
    'Contract from Below',
    'Darkpact',
    'Demonic Attorney',
    'Jeweled Bird',
    'Rebirth',
    'Tempest Efreet',
    'Timmerian Fiends',
  ],
  offensive: [
    'Cleanse',
    'Crusade',
    'Imprison',
    'Invoke Prejudice',
    'Jihad',
    'Pradesh Gypsies',
    'Stone-Throwing Devils',
  ],
  unfinity: [
    // sticker
    'Aerialephant',
    'Ambassador Blorpityblorpboop',
    'Baaallerina',
    '_____ Balls of Fire',
    'Bioluminary',
    '_____ Bird Gets the Worm',
    'Carnival Carnivore',
    'Chicken Troupe',
    'Clandestine Chameleon',
    'Command Performance',
    'Done for the Day',
    'Fight the _____ Fight',
    'Finishing Move',
    'Glitterflitter',
    '_____ Goblin',
    'Last Voyage of the _____',
    'Lineprancers',
    'Make a _____ Splash',
    'Minotaur de Force',
    '_____-o-saurus',
    'Park Bleater',
    'Pin Collection',
    'Prize Wall',
    'Proficient Pyrodancer',
    'Robo-Piñata',
    '_____ _____ Rocketship',
    'Roxi, Publicist to the Stars',
    'Scampire',
    'Stiltstrider',
    'Sword-Swallowing Seraph',
    'Ticketomaton',
    '_____ _____ _____ Trespasser',
    'Tusk and Whiskers',
    'Wicker Picker',
    'Wizards of the _____',
    'Wolf in _____ Clothing',
    // special sticker
    '"Name Sticker" Goblin',
    // attraction
    'Coming Attraction',
    'Complaints Clerk',
    'Deadbeat Attendant',
    'Dee Kay, Finder of the Lost',
    'Discourtesy Clerk',
    'Draconian Gate-Bot',
    '"Lifetime" Pass Holder',
    'Line Cutter',
    'Monitor Monitor',
    'Myra the Magnificent',
    'Petting Zookeeper',
    'Quick Fixer',
    'Rad Rascal',
    'Ride Guide',
    'Seasoned Buttoneer',
    'Soul Swindler',
    'Spinnerette, Arachnobat',
    'Squirrel Squatters',
    'Step Right Up',
    'The Most Dangerous Gamer',
  ],
};

/** The sentinel groups with a fixed card list, keyed by the group name after the # prefix. */
export const groupCardLists: Record<string, string[]> = Object.fromEntries(
  Object.entries(groupCardNames).map(([name, cards]) => [name, cards.map(slugifyName)]),
);
