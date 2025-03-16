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

const escapeMap: Record<string, string> = {
    '⟳': 'E',
    '⬡': 'I',
    '◊': 'L',
    '¤': 'S',
    '⛉': 'W',
    '◉': 'IW',
};

function escapeText(text: string): string {
    const regex = new RegExp(`[${Object.keys(escapeMap).join('')}]`, 'g');

    return text.replace(regex, v => `{${escapeMap[v]}}`);
}

export function toCard(
    data: JCard,
    lang: string,
    sets: ISet[],
    map: Record<string, string>,
): CardPrint {
    const abilityNames: string[] = [];

    if (data.abilities != null) {
        for (const a of data.abilities) {
            if (a.name != null) {
                abilityNames.push(a.name);
            }
        }
    }

    const set = sets.find(v => v.lorcanaJsonId === data.setCode)!;

    const loc = {
        name:     data.fullName,
        typeline: [data.type, ...data.subtypes ?? []].join('•'),
        text:     escapeText(
            data.fullTextSections.map(sec => {
                for (const n of abilityNames) {
                    if (sec.startsWith(n)) {
                        sec = sec.replace(n, `[${n}]`);
                    }
                }

                return sec.replace(/\n(?!•)/g, ' ');
            }).join('\n'),
        ),
    };

    return {
        card: {
            cardId: getId(data),

            cost:  data.cost,
            color: data.color === '' ? [] : data.color.split('-').map(v => transform(v, lang, map)) as Color[],

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

            tags: [],
        },
        print: {
            cardId: getId(data),

            lang,
            set:    set.setId,
            number: (() => {
                const num = data.number.toString();

                if (data.promoGrouping != null) {
                    return `${num}-${data.promoGrouping}`;
                }

                return num;
            })(),

            ...loc,

            flavorText: data.flavorText?.replace(/\n(?!—)/g, ' '),
            artist:     data.artistsText,

            imageUri: data.images as unknown as Record<string, string>,

            layout:      data.type === 'Location' ? 'location' : 'normal',
            rarity:      toIdentifier(data.rarity) as Rarity,
            releaseDate: set.releaseDate,
            finishes:    data.foilTypes?.map(v => toIdentifier(v)),

            id:           data.id,
            code:         data.code,
            tcgPlayerId:  data.externalLinks.tcgPlayerId,
            cardMarketId: data.externalLinks.cardmarketId,
            cardTraderId: data.externalLinks.cardTraderId,

            tags: [],
        },
    };
}
