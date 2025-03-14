/* eslint-disable camelcase */

import { Color, Card as ICard, MainType } from '@interface/lorcana/card';
import { Print as IPrint, Rarity } from '@interface/lorcana/print';
import { Set as ISet } from '@interface/lorcana/set';

import { Card as JCard } from '@interface/lorcana/lorcana-json/card';

import { toIdentifier } from '@common/util/id';

import { bulkUpdation } from '@/lorcana/logger';

type CardPrint = { card: ICard, print: IPrint };

function getId(data: JCard): string {
    return toIdentifier(data.fullName.replace(/ - /, '____'));
}

function transform(value: string, lang: string, map: Record<string, string>): string {
    if (value === '') {
        return '';
    }

    const mapped = map[value];

    if (mapped == null) {
        if (lang !== 'en') {
            bulkUpdation.error(`Unknown key ${value} for lang ${lang}`);
        }

        return toIdentifier(value);
    }

    return toIdentifier(mapped ?? value);
}

export function toCard(
    data: JCard,
    lang: string,
    sets: ISet[],
    map: Record<string, string>,
): CardPrint {
    const loc = {
        name:     data.fullName,
        typeline: [data.type, ...data.subtypes ?? []].join('·'),
        text:     data.fullText,
    };

    return {
        card: {
            cardId: getId(data),

            cost:  data.cost,
            color: data.color.split('-').map(v => transform(v, lang, map)) as Color[],

            inkwell: data.inkwell,

            ...lang === 'en' ? loc : {
                name:     '',
                typeline: '',
                text:     '',
            },

            type: {
                main: transform(data.type, lang, map) as MainType,
                ...data.subtypes != null ? { sub: data.subtypes.map(v => transform(v, lang, map)) } : {},
            },

            localization: [{ lang, ...loc }],

            lore:      data.lore,
            strength:  data.strength,
            willPower: data.willpower,
            moveCost:  data.moveCost,

            id:   data.id,
            code: data.code,
        },
        print: {
            cardId: getId(data),

            lang,
            set:    sets.find(v => v.lorcanaJsonId === data.setCode)!.setId,
            number: (() => {
                const num = data.number.toString();

                if (data.promoGrouping != null) {
                    return `${num}-${data.promoGrouping}`;
                }

                return num;
            })(),

            ...loc,

            flavorText: data.flavorText,
            artist:     data.artistsText,

            imageUri: data.images as unknown as Record<string, string>,

            layout:   data.type === 'Location' ? 'location' : 'normal',
            rarity:   toIdentifier(data.rarity) as Rarity,
            finishes: data.foilTypes?.map(v => toIdentifier(v)),

            tcgPlayerId:  data.externalLinks.tcgPlayerId,
            cardMarketId: data.externalLinks.cardmarketId,
            cardTraderId: data.externalLinks.cardTraderId,
        },
    };
}
