/* eslint-disable camelcase */

import { Color, Card as ICard, MainType } from '@interface/lorcana/card';
import { Print as IPrint, Rarity } from '@interface/lorcana/print';
import { Set as ISet } from '@interface/lorcana/set';

import { Card as JCard } from '@interface/lorcana/lorcana-json/card';

import { toIdentifier } from '@common/util/id';

type CardPrint = { card: ICard, print: IPrint };

function getId(data: JCard): string {
    return toIdentifier(data.fullName.replace(/ - /, '____'));
}

export function toCard(data: JCard, lang: string, sets: ISet[]): CardPrint {
    const loc = {
        name:     data.fullName,
        typeline: [data.type, ...data.subtypes ?? []].join('·'),
        text:     data.fullText,
    };

    return {
        card: {
            cardId: getId(data),

            cost:  data.cost,
            color: data.color.split('-').map(v => toIdentifier(v)) as Color[],

            inkwell: data.inkwell,

            ...lang === 'en' ? loc : {
                name:     '',
                typeline: '',
                text:     '',
            },

            type: {
                main: toIdentifier(data.type) as MainType,
                ...data.subtypes != null ? { sub: data.subtypes.map(v => toIdentifier(v)) } : {},
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
