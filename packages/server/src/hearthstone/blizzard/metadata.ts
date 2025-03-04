import Task from '@/common/task';
import blzApi from './api';

import {
    Locale, IMetadata, ISetGroup, ISpecialSetGroup,
} from '@interface/hearthstone/blizzard';

import { Set as ISet } from '@interface/hearthstone/set';

import Set from '../db/set';

const localeMap: Record<Locale, string> = {
    de_DE: 'de',
    en_US: 'en',
    es_ES: 'es',
    es_MX: 'mx',
    fr_FR: 'fr',
    it_IT: 'it',
    ja_JP: 'ja',
    pt_BR: 'pt',
    en_GB: 'en',
    pl_PL: 'pl',
    ru_RU: 'ru',
    ko_KR: 'ko',
    zh_CN: 'zhs',
    zh_TW: 'zht',
    th_TH: 'th',
};

function isNormalGroup(s: ISetGroup | ISpecialSetGroup): s is ISetGroup {
    return s.slug !== 'standard' && s.slug !== 'wild';
}

export class MetadataGetter extends Task<void> {
    async startImpl(): Promise<void> {
        const metadata = await blzApi<IMetadata>('/hearthstone/metadata');

        const setGroups = metadata.setGroups.filter(isNormalGroup);

        const sets: ISet[] = metadata.sets.map(s => ({
            setId:        s.slug,
            dbfId:        s.id,
            slug:         s.slug,
            localization: Object
                .entries(s.name)
                .map(([key, name]) => ({ lang: localeMap[key as Locale], name })),

            type:        s.type,
            releaseDate: s.releastDate ?? undefined,
            cardCount:   [s.collectibleCount, s.nonCollectibleCount],

            group: setGroups.find(g => g.cardSets.includes(s.slug))?.slug,
        }));

        const setExist = await Set.find({ slug: { $in: sets.map(s => s.slug) } });

        const setNonexist = sets.filter(s => !setExist.some(so => so.slug === s.slug));

        await Set.insertMany(setNonexist);

        for (const s of setExist) {
            const sn = sets.find(so => so.slug === s.slug);

            if (sn == null) {
                return;
            }

            s.dbfId = sn.dbfId;

            s.releaseDate = sn.releaseDate;
            s.cardCount = sn.cardCount;
            s.group = sn.group;
        }
    }

    stopImpl(): void { /* no-op */ }
}
