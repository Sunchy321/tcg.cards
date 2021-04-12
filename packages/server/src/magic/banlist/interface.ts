export type BanlistStatus =
    'legal' | 'restricted' | 'suspended' | 'banned' | 'banned_as_commander' | 'banned_as_companion' | 'unavailable';

export type Banlist = Record<string, BanlistStatus>;
