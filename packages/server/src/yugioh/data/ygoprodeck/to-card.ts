import { Card as ICard } from '@interface/yugioh/card';
import { Print as IPrint } from '@interface/yugioh/print';

import { Card as HCard } from '@interface/yugioh/ygoprodeck/card';

function getId(data: HCard): ICard['cardId'] {
    if (data.misc_info[0].konami_id != null) {
        return data.misc_info[0].konami_id.toString();
    } else {
        return `code:${data.id}`;
    }
}

type CardPrint = { card: ICard, prints: IPrint[] };

function getType(data: HCard): string {
    if (data.type.includes('Monster')) {
        return 'monster';
    }

    if (data.type.includes('Spell')) {
        return 'spell';
    }

    if (data.type.includes('Trap')) {
        return 'trap';
    }

    if (data.type.includes('Token')) {
        return 'token';
    }

    if (data.type.includes('Skill')) {
        return 'skill';
    }

    throw new Error('unknown card type');
}

export function toCard(data: HCard): CardPrint {
    const loc = {
        name:     data.name,
        typeline: data.humanReadableCardType,
        text:     data.desc,
    };

    return {
        card: {
            cardId: getId(data),

            localization: [{ lang: 'en', ...loc }],

            type: {
                main: getType(data),
                sub:  data.typeline?.map(t => t.toLowerCase())?.filter(t => t != data.race.toLowerCase()),
            },

            attribute:   data.attribute?.toLowerCase(),
            level:       data.level != null && (data.typeline == null || !data.typeline.includes('Xyz')) ? data.level : undefined,
            rank:        data.level != null && (data.typeline != null && data.typeline.includes('Xyz')) ? data.level : undefined,
            linkValue:   data.linkval,
            linkMarkers: data.linkmarkers,
            attack:      data.atk,
            defense:     data.def,
            race:        data.race.toLowerCase(),

            category:   'normal',
            legalities: {},

            tags: [],

            konamiId: data.misc_info[0].konami_id,
            passcode: data.id,
        },
        prints: (data.card_sets ?? []).map(v => ({
            cardId: getId(data),

            lang:   'en',
            set:    v.set_code.split('-')[0],
            number: v.set_code.split('-')[1],

            name:     data.name,
            typeline: data.humanReadableCardType,
            text:     data.desc,

            passcode: data.id,

            layout:      data.frameType,
            rarity:      v.set_rarity_code.replace(/^\(/, '').replace(/\)$/, ''),
            releaseDate: '',

            tags: [],
        })),
    };
}
