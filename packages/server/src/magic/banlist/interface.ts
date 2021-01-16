export type BanlistStatus =
    'legal' | 'restricted' | 'suspended' | 'banned' | 'banned_as_commander' | 'unavailable';

export type Banlist = Record<string, BanlistStatus>;
