import { Card as ICard } from '@interface/yugioh/card';

import { Card as HCard } from '@interface/yugioh/yugioh-history/card';

function getId(data: HCard): string {
    return data.id.toString();
}

export function toCard(
    data: HCard,
    lang: string,
): ICard {
    const loc = {
        name:     data.name,
        typeline: (data.properties ?? []).join('/'),
        text:     data.pendEffect != null
            ? data.pendEffect + '\n' + '-'.repeat(30) + '\n' + data.effectText
            : data.effectText,
    };

    return {
        cardId: getId(data),

        localization: [{ lang, ...loc, lastDate: '' }],

        type: {
            main: ['TODO'],
            sub:  ['TODO'],
        },

        attribute:   data.englishAttribute,
        level:       data.level,
        rank:        data.rank,
        linkValue:   data.linkRating,
        linkMarkers: data.linkArrows,
        attack:      data.atk,
        defense:     data.def,
        race:        'TODO',

        category:   'normal',
        legalities: {},

        tags: [],
    };
}
