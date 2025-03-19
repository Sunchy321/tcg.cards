import { Card as ICard, Category } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';

import { Colors } from '@interface/magic/scryfall/basic';
import { CardFace, RawCard } from '@interface/magic/scryfall/card';

import { toIdentifier } from '@common/util/id';
import { convertColor, convertMana, parseTypeline } from '@/magic/util';

type RawCardNoArtSeries = Omit<RawCard, 'layout'> & {
    layout: Exclude<RawCard['layout'], 'art_series'>;
};

type NCardFace = Omit<CardFace, 'colors'> & {
    colors:             Colors;
    hand_modifier?:     string;
    life_modifier?:     string;
    flavor_name?:       string;
    attraction_lights?: number[];
};

type NCardBase = Omit<RawCard, Exclude<keyof NCardFace, 'cmc' | 'image_uris' | 'oracle_id'> | 'card_faces' | 'layout'> & {
    card_faces: NCardFace[];
    face?:      'back' | 'bottom' | 'front' | 'top';
};

type NCardFaceExtracted = NCardBase & { layout: RawCardNoArtSeries['layout'] };
type NCardSplit = NCardBase & {
    layout: Exclude<NCardFaceExtracted['layout'], 'double_faced_token'> | 'double_faced' | 'flip_token_bottom' | 'flip_token_top' | 'transform_token';
};

type CardPrint = { card: ICard, print: IPrint };

function splitCost(cost: string) {
    return cost.split(/\{([^}]+)\}/).filter(v => v !== '');
}

function toCostMap(cost: string) {
    const result: Record<string, number> = {};

    for (const c of splitCost(cost)) {
        if (/^\d+$/.test(c)) {
            result[''] = Number.parseInt(c, 10);
        } else {
            result[c] = (result[c] ?? 0) + 1;
        }
    }

    return result;
}

function purifyText(text: string) {
    const symbolMap: Record<string, string> = {
        '-': '-',
        '—': '-',
        '―': '-',
        '－': '-',
        '–': '-',
        '−': '-',

        '＋': '+',
        '+': '+',
    };

    const numberMap: Record<string, string> = {
        '０': '0',
        '１': '1',
        '２': '2',
        '３': '3',
        '４': '4',
        '５': '5',
        '６': '6',
        '７': '7',
        '８': '8',
        '９': '9',
        'Ｘ': 'X',
    };

    const replacer = (_: string, sym: string, num: string) => `[${symbolMap[sym]}${num.split('').map(n => numberMap[n] ?? n).join('')}]`;

    return text
        .replace(/\{½\}/g, '{H1}')
        .replace(/^([-—―－–−＋+])([0-9X０-９Ｘ]+)(?!\/)/mg, replacer)
        .replace(/\[([-—―－–−＋+])([0-9X０-９Ｘ]+)\]/mg, replacer)
        .replace(/^[0０](?=[:：]| :)/mg, '[0]')
        .replace(/\[０\]/mg, '[0]');
}

function isMinigame(data: NCardBase) {
    return data.set_name.endsWith('Minigames');
}

const keywordMap: Record<string, string> = {
    'changeling':   'c',
    'deathtouch':   'd',
    'defender':     'e',
    'first strike': 's',
    'flying':       'f',
    'haste':        'h',
    'hexproof':     'x',
    'lifelink':     'l',
    'menace':       'm',
    'reach':        'r',
    'trample':      't',
    'vigilance':    'v',
    'prowess':      'p',
};

function getId(data: NCardBase & { layout: string }): string {
    const cardFaces = data.layout === 'reversible_card' ? [data.card_faces[0]] : data.card_faces;

    const nameId = cardFaces.map(f => toIdentifier(f.name)).join('____');

    if (data.card_faces[0]?.name === 'Incubator') {
        return 'incubator!';
    } else if (['token', 'flip_token_top', 'flip_token_bottom'].includes(data.layout)) {
        const { main: typeMain, sub: typeSub } = parseTypeline(cardFaces[0].type_line ?? '');

        if (typeSub == null) {
            if (typeMain.includes('card')) {
                return nameId;
            } else {
                return `${nameId}!`;
            }
        } else {
            let baseId = typeSub.join('_');

            if (
                nameId !== baseId
                || ['treasure', 'food', 'gold', 'shard', 'clue', 'blood', 'powerstone', 'map'].includes(baseId)
            ) {
                return `${nameId}!`;
            }

            const face = cardFaces[0];

            const colors = convertColor(face.colors);

            baseId += `!${colors.length > 0 ? colors.toLowerCase() : 'c'}`;

            if (face.power != null && face.toughness != null) {
                baseId += `!${face.power}${face.toughness}`;
            }

            if (face.oracle_text != null && face.oracle_text !== '') {
                baseId += '!';

                for (const line of face.oracle_text.toLowerCase().split('\n')) {
                    const trySplit = line.split(/ *, */);

                    if (trySplit.every(p => keywordMap[p] != null)) {
                        baseId += trySplit.map(p => keywordMap[p]).join('');
                        continue;
                    }

                    const tryReplace = line.replace(/ *\([^()]+\)$/, '');

                    if (keywordMap[tryReplace] != null) {
                        baseId += keywordMap[tryReplace];
                        continue;
                    }

                    baseId += 'a';
                }
            }

            if (face.type_line.includes('Creature') && face.type_line.includes('Enchantment')) {
                if (face.oracle_text != null) {
                    baseId += '!e';
                } else {
                    baseId += '!!e';
                }
            }

            return baseId;
        }
    } else if (isMinigame(data)) {
        return toIdentifier(cardFaces[0].name);
    } else if (/^\(Theme Color: (\{.\})+\)/.test(data.card_faces[0].oracle_text ?? '')) {
        const m = /^\(Theme Color: ((?:\{.\})+)\)/.exec(data.card_faces[0].oracle_text ?? '');

        const colors = m![1].toLowerCase().replace(/\{(.)\}/g, (_, v) => v);

        return `${nameId}_${colors}`;
    } else {
        return nameId;
    }
}

export function toCard(data: NCardSplit, setCodeMap: Record<string, string>): CardPrint {
    const cardFaces = data.layout === 'reversible_card' ? [data.card_faces[0]] : data.card_faces;

    return {
        card: {
            cardId: getId(data),

            manaValue:     data.cmc,
            colorIdentity: convertColor(data.color_identity),

            parts: cardFaces.map(f => ({
                name:     f.name,
                typeline: f.type_line ?? '',
                text:     purifyText(f.oracle_text ?? ''),

                localization: [{
                    lang:     data.lang,
                    name:     f.flavor_name === f.name ? f.name : f.printed_name ?? f.name,
                    typeline: (f.printed_type_line ?? f.type_line ?? '').replace(/ ～/, '～'),
                    text:     purifyText(f.printed_text ?? f.oracle_text ?? ''),
                }],

                cost:           f.mana_cost != null && f.mana_cost !== '' ? splitCost(f.mana_cost) : undefined,
                __costMap:      f.mana_cost != null && f.mana_cost !== '' ? toCostMap(f.mana_cost) : undefined,
                manaValue:      f.cmc,
                color:          convertColor(f.colors),
                colorIndicator: f.color_indicator != null
                    ? convertColor(f.color_indicator)
                    : undefined,

                type: parseTypeline(f.type_line ?? ''),

                power:        f.power,
                toughness:    f.toughness,
                loyalty:      f.loyalty,
                defense:      f.defense,
                handModifier: f.hand_modifier,
                lifeModifier: f.life_modifier,
            })),

            keywords:       data.keywords.map(v => toIdentifier(v)),
            counters:       cardFaces.some(c => (c.oracle_text ?? '').includes('counter')) ? [] : undefined,
            producibleMana: data.produced_mana != null
                ? convertMana(data.produced_mana)
                : undefined,
            tags: [
                ...data.reserved ? ['reserved'] : [],
                ...cardFaces.some(c => /\bcreates?|embalm|eternalize|squad|offspring\b/i.test(c.oracle_text ?? '')) ? ['dev:token'] : [],
                ...cardFaces.some(c => /\bcounters?\b/.test(c.oracle_text ?? '')) ? ['dev:counter'] : [],
            ],

            category: ((): Category => {
                if (data.card_faces.some(f => /\btoken\b/i.test(f.type_line ?? ''))) {
                    return 'token';
                } else if (isMinigame(data)) {
                    return 'minigame';
                } else {
                    return 'default';
                }
            })(),

            legalities:     {},
            contentWarning: data.content_warning,

            scryfall: {
                oracleId: [data.oracle_id],
            },
        },
        print: {
            cardId: getId(data),

            lang:   data.lang,
            set:    setCodeMap[data.set] ?? data.set,
            number: data.collector_number,

            parts: cardFaces.map(f => ({
                name:     f.flavor_name === f.name ? f.name : f.printed_name ?? f.name,
                typeline: (f.printed_type_line ?? f.type_line ?? '').replace(/ ～/, '～'),
                text:     purifyText(f.printed_text ?? f.oracle_text ?? ''),

                attractionLights: f.attraction_lights,

                scryfallIllusId: (() => {
                    const illusId = f.illustration_id;

                    if (illusId == null) {
                        return undefined;
                    }

                    if (data.layout === 'reversible_card') {
                        return data.card_faces.map(f => f.illustration_id).filter(v => v != null) as string[];
                    } else {
                        return [illusId];
                    }
                })(),

                flavorName: f.flavor_name,
                flavorText: f.flavor_text,
                artist:     f.artist,
                watermark:  f.watermark,
            })),

            tags: [
                ...data.full_art ? ['full-art'] : [],
                ...data.oversized ? ['oversized'] : [],
                ...data.story_spotlight ? ['story-spotlight'] : [],
                ...data.textless ? ['textless'] : [],
            ],

            layout: (() => {
                if (data.layout === 'split') {
                    if (data.keywords.includes('Aftermath')) {
                        if (data.games.includes('paper')) {
                            return 'aftermath';
                        } else {
                            return 'split_arena';
                        }
                    }
                }

                if (data.card_faces[0].type_line.includes('Battle')) {
                    return 'battle';
                }

                return data.layout;
            })(),

            frame:         data.frame,
            frameEffects:  data.frame_effects ?? [],
            borderColor:   data.border_color,
            cardBack:      data.card_back_id,
            securityStamp: data.security_stamp,
            promoTypes:    data.promo_types,
            rarity:        data.rarity,
            releaseDate:   data.released_at,

            isDigital:       data.digital,
            isPromo:         data.promo,
            isReprint:       data.reprint,
            finishes:        data.finishes,
            hasHighResImage: data.highres_image,
            imageStatus:     data.image_status,

            inBooster: data.booster,
            games:     data.games,

            preview: data.preview != null
                ? {
                    date:   data.preview.previewed_at,
                    source: data.preview.source,
                    uri:    data.preview.source_uri,
                }
                : undefined,

            scryfall: {
                oracleId:  data.oracle_id,
                cardId:    data.id,
                ...data.face == null ? { } : { face: data.face },
                imageUris: data.image_uris != null ? [data.image_uris] : data.card_faces.map(v => v.image_uris ?? {}),
            },

            arenaId:      data.arena_id,
            mtgoId:       data.mtgo_id,
            mtgoFoilId:   data.mtgo_foil_id,
            multiverseId: data.multiverse_ids,
            tcgPlayerId:  data.tcgplayer_id,
            cardMarketId: data.cardmarket_id,
        },
    };
}
