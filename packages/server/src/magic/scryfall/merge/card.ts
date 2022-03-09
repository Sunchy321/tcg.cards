/* eslint-disable camelcase */
import Task from '@/common/task';

import ScryfallCard, { ICard as ISCard, ICardBase as ISCardBase } from '../../db/scryfall/card';
import Card, { ICard, CardType } from '../../db/card';

import { CardFace, Colors, IStatus } from '../interface';
import { Document } from 'mongoose';
import { Diff } from 'deep-diff';

import { toAsyncBucket } from '@/common/to-bucket';
import { convertColor, parseTypeline, toIdentifier, convertLegality } from '@/magic/util';
import { cardImagePath } from '@/magic/image';
import { existsSync, unlinkSync } from 'fs';
import { isEqual } from 'lodash';

type NCardFace = Omit<CardFace, 'colors'> & {
    colors: Colors,
    hand_modifier?: string,
    life_modifier?: string,
    flavor_name?: string,
}

type NSCard = Omit<ISCard, 'card_faces' | keyof NCardFace> & {
    card_faces: NCardFace[],
    face?: 'front'|'back'
}

function splitCost(cost: string) {
    return cost.split(/\{([^}]+)\}/).filter(v => v !== '');
}

function toCostMap(cost: string) {
    const result: Record<string, number> = {};

    for (const c of splitCost(cost)) {
        if (/^\d+$/.test(c)) {
            result[''] = Number.parseInt(c);
        } else {
            result[c] = (result[c] ?? 0) + 1;
        }
    }

    return result;
}

function purifyText(text: string|undefined) {
    return text?.replace(/\{½\}/g, '{H1}');
}

function extractCardFace(card: ISCard): NCardFace[] {
    if (card.card_faces != null) {
        return card.card_faces.map(f => {
            if (f.colors == null) {
                return { ...f, colors: card.colors! } as NCardFace;
            } else {
                return f as NCardFace;
            }
        });
    } else {
        return [{
            artist:            card.artist,
            color_indicator:   card.color_indicator,
            colors:            card.colors!,
            flavor_text:       card.flavor_text,
            illustration_id:   card.illustration_id,
            image_uris:        card.image_uris,
            loyalty:           card.loyalty,
            mana_cost:         card.mana_cost!,
            name:              card.name,
            object:            'card_face',
            oracle_text:       card.oracle_text,
            power:             card.power,
            printed_name:      card.printed_name,
            printed_text:      card.printed_text,
            printed_type_line: card.printed_type_line,
            toughness:         card.toughness,
            type_line:         card.type_line,
            watermark:         card.watermark,

            hand_modifier: card.hand_modifier,
            life_modifier: card.life_modifier,

            flavor_name: card.flavor_name,
        }];
    }
}

function toNSCard(card: ISCard): NSCard {
    return { ...card, card_faces: extractCardFace(card) };
}

function splitDFT(card: NSCard): NSCard[] {
    if (card.layout === 'double_faced_token') {
        return [
            {
                ...card,
                color_identity:   card.card_faces[0].colors,
                collector_number: card.collector_number + '-0',
                layout:           'token',
                card_faces:       [card.card_faces[0]],
                face:             'front',
            },
            {
                ...card,
                color_identity:   card.card_faces[1].colors,
                collector_number: card.collector_number + '-1',
                layout:           'token',
                card_faces:       [card.card_faces[1]],
                face:             'back',
            },
        ];
    } else {
        return [card];
    }
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

function getId(data: NSCard): string {
    const nameId = data.card_faces.map(f => toIdentifier(f.name)).join('____');

    if (data.layout === 'token') {
        const { typeMain, typeSub } = parseTypeline(data.card_faces[0].type_line);

        if (typeSub == null) {
            if (typeMain.includes('card')) {
                return nameId;
            } else {
                return nameId + '!';
            }
        } else {
            let baseId = typeSub.join('_');

            if (
                nameId !== baseId ||
                ['gold', 'clue', 'treasure', 'food'].includes(baseId)
            ) {
                return nameId + '!';
            }

            const face = data.card_faces[0];

            baseId += '!' + (face.colors.length > 0 ? face.colors.join('').toLowerCase() : 'c');

            if (face.power && face.toughness) {
                baseId += `!${face.power}${face.toughness}`;
            }

            if (face.oracle_text) {
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
                if (face.oracle_text) {
                    baseId += '!e';
                } else {
                    baseId += '!!e';
                }
            }

            return baseId;
        }
    } else {
        return nameId;
    }
}

function toCard(data: NSCard): ICard {
    return {
        cardId: getId(data),

        lang:   data.lang,
        set:    data.set_id,
        number: data.collector_number,

        manaValue:     data.cmc,
        colorIdentity: convertColor(data.color_identity),

        parts: data.card_faces.map(f => ({
            cost:      f.mana_cost != null && f.mana_cost !== '' ? splitCost(f.mana_cost) : undefined,
            __costMap: f.mana_cost != null && f.mana_cost !== '' ? toCostMap(f.mana_cost) : undefined,

            color:          convertColor(f.colors),
            colorIndicator: f.color_indicator != null
                ? convertColor(f.color_indicator)
                : undefined,

            ...parseTypeline(f.type_line),

            power:        f.power,
            toughness:    f.toughness,
            loyalty:      f.loyalty,
            handModifier: f.hand_modifier,
            lifeModifier: f.life_modifier,

            oracle: {
                name:     f.name,
                text:     purifyText(f.oracle_text),
                typeline: f.type_line,
            },

            unified: {
                name:     f.printed_name || f.name,
                text:     purifyText(f.printed_text || f.oracle_text),
                typeline: (f.printed_type_line || f.type_line).replace(/ ～/, '～'),
            },

            printed: {
                name:     f.printed_name || f.name,
                text:     purifyText(f.printed_text || f.oracle_text),
                typeline: (f.printed_type_line || f.type_line).replace(/ ～/, '～'),
            },

            scryfallIllusId: f.illustration_id,
            flavorName:      f.flavor_name,
            flavorText:      f.flavor_text,
            artist:          f.artist,
            watermark:       f.watermark,
        })),

        relatedCards: [],
        rulings:      [],

        keywords:     data.keywords,
        producedMana: data.produced_mana != null
            ? convertColor(data.produced_mana)
            : undefined,

        cardType: ((): CardType => {
            return 'normal';
        })(),

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

            return data.layout;
        })(),

        frame:        data.frame,
        frameEffects: data.frame_effects,
        borderColor:  data.border_color,
        cardBack:     data.card_back_id,
        promoTypes:   data.promo_types,
        rarity:       data.rarity,
        releaseDate:  data.released_at,

        isDigital:        data.digital,
        isFullArt:        data.full_art,
        isOversized:      data.oversized,
        isPromo:          data.promo,
        isReprint:        data.reprint,
        isStorySpotlight: data.story_spotlight,
        isTextless:       data.textless,
        hasFoil:          data.foil,
        hasNonfoil:       data.nonfoil,
        hasHighResImage:  data.highres_image,

        legalities:     convertLegality(data.legalities),
        isReserved:     data.reserved,
        inBooster:      data.booster,
        contentWarning: data.content_warning,
        games:          data.games,

        preview: data.preview != null ? {
            date:   data.preview.previewed_at,
            source: data.preview.source,
            uri:    data.preview.source_uri,
        } : undefined,

        scryfall: {
            cardId:   data.card_id,
            oracleId: data.oracle_id,
            face:     data.face,
        },
        arenaId:      data.arena_id,
        mtgoId:       data.mtgo_id,
        mtgoFoilId:   data.mtgo_foil_id,
        multiverseId: data.multiverse_ids,
        tcgPlayerId:  data.tcgplayer_id,
        cardMarketId: data.cardmarket_id,

        __tags: {
            oracleUpdated: false,
        },
    };
}

function deleteImage(data: ICard) {
    for (const type of ['png', 'border_crop', 'art_crop', 'large', 'normal', 'small']) {
        const path = cardImagePath(type, data.set, data.lang, data.number);

        if (existsSync(path)) {
            unlinkSync(path);
        }

        for (let i = 0; i < data.parts.length; ++i) {
            const path = cardImagePath(type, data.set, data.lang, data.number, i);

            if (existsSync(path)) {
                unlinkSync(path);
            }
        }
    }
}

const ignoreList: (keyof ISCardBase)[] = [
    'all_parts',
    'artist_ids',
    'edhrec_rank',
    'image_uris',
    'prices',
    'related_uris',
    'scryfall_set_uri',
    'scryfall_uri',
    'set_name',
    'set_search_uri',
    'set_type',
    'set_uri',
];

const assignMap: Partial<Record<keyof ISCardBase, keyof ICard>> = {
    keywords: 'keywords',

    frame:         'frame',
    frame_effects: 'frameEffects',
    border_color:  'borderColor',
    promo_types:   'promoTypes',
    released_at:   'releaseDate',

    digital:         'isDigital',
    full_art:        'isFullArt',
    oversized:       'isOversized',
    promo:           'isPromo',
    reprint:         'isReprint',
    story_spotlight: 'isStorySpotlight',
    textless:        'isTextless',
    foil:            'hasFoil',
    nonfoil:         'hasNonfoil',

    reserved: 'isReserved',
    booster:  'inBooster',
    games:    'games',

    arena_id:       'arenaId',
    mtgo_id:        'mtgoId',
    mtgo_foil_id:   'mtgoFoilId',
    multiverse_ids: 'multiverseId',
    tcgplayer_id:   'tcgPlayerId',
    cardmarket_id:  'cardMarketId',
};

function merge(card: ICard & Document, data: ICard, diff: Diff<ISCardBase>[]) {
    for (const d of diff) {
        if (ignoreList.includes(d.path![0])) {
            continue;
        }

        if (Object.keys(assignMap).includes(d.path![0])) {
            const newKey = assignMap[d.path![0] as keyof ISCardBase]!;

            if (!isEqual(card[newKey], data[newKey])) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (card as any)[newKey] = data[newKey];
            }

            continue;
        }

        switch (d.path![0]) {
        case 'set_id':
            if (card.set !== data.set) {
                deleteImage(card);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (card as any).set = data.set;
            }
            break;
        case 'collector_number':
            if (card.number !== data.number) {
                deleteImage(card);
                card.number = data.number;
            }
            break;
        case 'card_faces':
            switch (d.path![2]) {
            case 'name':
                if (card.parts[d.path![1]].oracle.name !== data.parts[d.path![1]].oracle.name) {
                    card.parts[d.path![1]].oracle.name = data.parts[d.path![1]].oracle.name;
                    card.__tags.oracleUpdated = true;

                    if (card.lang === 'en') {
                        card.parts[d.path![1]].unified.name = data.parts[d.path![1]].oracle.name;
                    }
                }
                break;
            case 'type_line':
                if (card.parts[d.path![1]].oracle.typeline !== data.parts[d.path![1]].oracle.typeline) {
                    card.parts[d.path![1]].oracle.typeline = data.parts[d.path![1]].oracle.typeline;
                    card.__tags.oracleUpdated = true;

                    if (card.lang === 'en') {
                        card.parts[d.path![1]].unified.typeline = data.parts[d.path![1]].oracle.typeline;
                    }

                    const type = parseTypeline(data.parts[d.path![1]].oracle.typeline);

                    card.parts[d.path![1]].typeMain = type.typeMain;
                    card.parts[d.path![1]].typeSuper = type.typeSuper;
                    card.parts[d.path![1]].typeSub = type.typeSub;
                }
                break;
            case 'oracle_text':
                if (card.parts[d.path![1]].oracle.text !== data.parts[d.path![1]].oracle.text) {
                    card.parts[d.path![1]].oracle.text = data.parts[d.path![1]].oracle.text;
                    card.__tags.oracleUpdated = true;

                    if (card.lang === 'en') {
                        card.parts[d.path![1]].unified.text = data.parts[d.path![1]].oracle.text;
                    }
                }
                break;
            }
            break;
        case 'color_indicator':
            if (card.parts[0].colorIndicator !== data.parts[0].colorIndicator) {
                card.parts[0].colorIndicator = data.parts[0].colorIndicator;
            }
            break;
        case 'name':
            if (card.parts[0].oracle.name !== data.parts[0].oracle.name) {
                card.parts[0].oracle.name = data.parts[0].oracle.name;
                card.__tags.oracleUpdated = true;

                if (card.lang === 'en') {
                    card.parts[0].unified.name = data.parts[0].oracle.name;
                }
            }
            break;
        case 'type_line':
            if (card.parts[0].oracle.typeline !== data.parts[0].oracle.typeline) {
                card.parts[0].oracle.typeline = data.parts[0].oracle.typeline;
                card.__tags.oracleUpdated = true;

                if (card.lang === 'en') {
                    card.parts[0].unified.typeline = data.parts[0].oracle.typeline;
                }

                const type = parseTypeline(data.parts[0].oracle.typeline);

                card.parts[0].typeMain = type.typeMain;
                card.parts[0].typeSuper = type.typeSuper;
                card.parts[0].typeSub = type.typeSub;
            }
            break;
        case 'oracle_text':
            if (card.parts[0].oracle.text !== data.parts[0].oracle.text) {
                card.parts[0].oracle.text = data.parts[0].oracle.text;
                card.__tags.oracleUpdated = true;

                if (card.lang === 'en') {
                    card.parts[0].unified.text = data.parts[0].oracle.text;
                }
            }
            break;
        case 'artist':
            if (card.parts[0].artist !== data.parts[0].artist) {
                card.parts[0].artist = data.parts[0].artist;
            }
            break;
        case 'highres_image':
            if (card.hasHighResImage !== data.hasHighResImage) {
                deleteImage(card);
                card.hasHighResImage = data.hasHighResImage;
            }
            break;
        case 'legalities':
            if (!isEqual(card.legalities, data.legalities)) {
                card.legalities = data.legalities;
            }
            break;
        case 'arenaId':
            if (card.arenaId !== data.arenaId) {
                card.arenaId = data.arenaId;
            }
            break;
        case 'mtgoId':
            if (card.mtgoId !== data.mtgoId) {
                card.mtgoId = data.mtgoId;
            }
            break;
        case 'mtgoFoilId':
            if (card.mtgoFoilId !== data.mtgoFoilId) {
                card.mtgoFoilId = data.mtgoFoilId;
            }
            break;
        case 'multiverseId':
            if (card.multiverseId !== data.multiverseId) {
                card.multiverseId = data.multiverseId;
            }
            break;
        case 'tcgPlayerId':
            if (card.tcgPlayerId !== data.tcgPlayerId) {
                card.tcgPlayerId = data.tcgPlayerId;
            }
            break;
        case 'cardMarketId':
            if (card.cardMarketId !== data.cardMarketId) {
                card.cardMarketId = data.cardMarketId;
            }
        }
    }
}

const bucketSize = 500;

export class CardMerger extends Task<IStatus> {
    progressId?: NodeJS.Timeout;

    async startImpl(): Promise<void> {
        let count = 0;

        const files = await ScryfallCard.aggregate([
            { $group: { _id: '$__file' } },
            { $sort: { _id: -1 } },
        ]);

        const lastFile = files[0]._id;

        const total = await ScryfallCard.countDocuments({ __file: lastFile });

        const start = Date.now();

        this.intervalProgress(500, function () {
            const prog: IStatus = {
                method: 'merge',
                type:   'card',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: elapsed / count * (total - count),
            };

            return prog;
        });

        const query = ScryfallCard.find({ __file: lastFile }).lean();

        for await (const jsons of toAsyncBucket(
            query as unknown as AsyncGenerator<ISCard>,
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            const cards = await Card.find({ 'scryfall.cardId': { $in: jsons.map(j => j.card_id) } });

            const cardsToInsert: ICard[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series') {
                    continue;
                }

                const newCards = splitDFT(toNSCard(json));

                const oldCards = cards.filter(c => c.scryfall.cardId === json.card_id);

                if (newCards.length === 1) {
                    // a single card
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(toCard));
                    } else if (oldCards.length === 1) {
                        merge(oldCards[0], toCard(newCards[0]), newCards[0].__diff!);

                        if (oldCards[0].modifiedPaths().length > 0) {
                            await oldCards[0].save();
                        }
                    } else {
                        throw new Error('mismatch object count');
                    }
                } else if (newCards.length === 2) {
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(toCard));
                    } else if (oldCards.length === 1 || oldCards.length === 2) {
                        for (const n of newCards) {
                            if (n.face === 'front') {
                                const front = oldCards.find(c => c.scryfall.face === 'front');

                                if (front != null) {
                                    merge(front, toCard(n), n.__diff!);
                                } else {
                                    cardsToInsert.push(toCard(n));
                                }
                            } else {
                                const back = oldCards.find(c => c.scryfall.face === 'back');

                                if (back != null) {
                                    merge(back, toCard(n), n.__diff!);
                                } else {
                                    cardsToInsert.push(toCard(n));
                                }
                            }
                        }
                    } else {
                        throw new Error('mismatch object count');
                    }
                }

                ++count;
            }

            await Card.insertMany(cardsToInsert);
        }
    }

    stopImpl(): void { /* no-op */ }
}
