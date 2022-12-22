import { Legality } from './format-change';

export interface Format {
    formatId: string;
    localization: { lang: string, name: string }[];
    sets?: string[];
    banlist: { id: string, status: Legality, date: string, group?: string }[];
    birthday?: string;
    deathdate?: string;
}
