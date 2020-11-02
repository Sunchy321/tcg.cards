export type BanlistStatus =
    'legal' | 'restricted' | 'banned' | 'banned_as_commander' | 'suspended';

export type Banlist = Record<string, BanlistStatus>;