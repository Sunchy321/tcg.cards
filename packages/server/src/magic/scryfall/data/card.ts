/* eslint-disable camelcase */
import Task from '@/common/task';

import Card, { ICard } from '@/magic/db/card';
import SCard from '@/magic/db/scryfall-card';
import Set from '@/magic/db/set';
import CardUpdation, { ICardUpdation } from '@/magic/db/card-updation';

import { Category } from '@interface/magic/card';
import { Colors } from '@interface/magic/scryfall/basic';
import { CardFace, RawCard } from '@interface/magic/scryfall/card';

import { Document } from 'mongoose';
import { Status } from '../status';

import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { isEqual, omit } from 'lodash';
import { toAsyncBucket } from '@/common/to-bucket';
import LineReader from '@/common/line-reader';
import {
    convertColor, convertMana, parseTypeline, toIdentifier,
} from '@/magic/util';
import { bulkPath, convertJson } from './common';

import { cardImagePath } from '@/magic/image';

type RawCardNoArtSeries = Omit<RawCard, 'layout'> & {
    layout: Exclude<RawCard['layout'], 'art_series'>;
};

type NCardFace = Omit<CardFace, 'colors'> & {
    colors: Colors;
    hand_modifier?: string;
    life_modifier?: string;
    flavor_name?: string;
    attraction_lights?: number[];
};

type NCardBase = Omit<RawCard, Exclude<keyof NCardFace, 'cmc' | 'image_uris' | 'oracle_id'> | 'card_faces' | 'layout'> & {
    card_faces: NCardFace[];
    face?: 'back' | 'bottom' | 'front' | 'top';
};

type NCardFaceExtracted = NCardBase & { layout: RawCardNoArtSeries['layout'] };
type NCardSplit = NCardBase & {
    layout: Exclude<NCardFaceExtracted['layout'], 'double_faced_token'> | 'double_faced' | 'flip_token_bottom' | 'flip_token_top' | 'transform_token';
};

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

function purifyText(text: string | undefined) {
    if (text == null) {
        return text;
    }

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

function extractCardFace(card: RawCard): NCardFace[] {
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
            defense:           card.defense,
            flavor_text:       card.flavor_text,
            illustration_id:   card.illustration_id,
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

            hand_modifier:     card.hand_modifier,
            life_modifier:     card.life_modifier,
            attraction_lights: card.attraction_lights,

            flavor_name: card.flavor_name,
        }];
    }
}

function toNSCard(card: RawCardNoArtSeries): NCardFaceExtracted {
    return { ...card, card_faces: extractCardFace(card) };
}

function splitDFT(card: NCardFaceExtracted): NCardSplit[] {
    if (isMinigame(card)) {
        return [{ ...card, layout: card.card_faces.length > 1 ? 'double_faced' : 'normal' }];
    }

    if (card.card_faces[0]?.name === 'Day' && card.card_faces[1]?.name === 'Night') {
        return [{ ...card, layout: 'token' }];
    }

    if (card.card_faces[0]?.name === 'Incubator') {
        return [{ ...card, layout: 'transform_token' }];
    }

    if (card.layout === 'double_faced_token' && card.card_faces[0]?.name !== 'The Ring') {
        if (card.set) {
            return [
                {
                    ...card,
                    color_identity:   card.card_faces[0].colors,
                    collector_number: `${card.collector_number}-0`,
                    layout:           'token',
                    card_faces:       [card.card_faces[0]],
                    face:             'front',
                },
                {
                    ...card,
                    color_identity:   card.card_faces[1].colors,
                    collector_number: `${card.collector_number}-1`,
                    layout:           'token',
                    card_faces:       [card.card_faces[1]],
                    face:             'back',
                },
            ];
        }
    }

    if (card.layout === 'flip' && card.card_faces[0].type_line.includes('Token')) {
        return [
            {
                ...card,
                color_identity:   card.card_faces[0].colors,
                collector_number: `${card.collector_number}-0`,
                layout:           'flip_token_top',
                card_faces:       [card.card_faces[0]],
                face:             'top',
            },
            {
                ...card,
                color_identity:   card.card_faces[1].colors,
                collector_number: `${card.collector_number}-1`,
                layout:           'flip_token_bottom',
                card_faces:       [card.card_faces[1]],
                face:             'bottom',
            },
        ];
    }

    return [card as NCardSplit];
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
        const { typeMain, typeSub } = parseTypeline(cardFaces[0].type_line ?? '');

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

function toCard(data: NCardSplit, setCodeMap: Record<string, string>): ICard {
    const cardFaces = data.layout === 'reversible_card' ? [data.card_faces[0]] : data.card_faces;

    return {
        cardId: getId(data),

        lang:   data.lang,
        set:    setCodeMap[data.set] ?? data.set,
        number: data.collector_number,

        manaValue:     data.cmc,
        colorIdentity: convertColor(data.color_identity),

        parts: cardFaces.map(f => ({
            cost:      f.mana_cost != null && f.mana_cost !== '' ? splitCost(f.mana_cost) : undefined,
            __costMap: f.mana_cost != null && f.mana_cost !== '' ? toCostMap(f.mana_cost) : undefined,

            color:          convertColor(f.colors),
            colorIndicator: f.color_indicator != null
                ? convertColor(f.color_indicator)
                : undefined,

            ...parseTypeline(f.type_line ?? ''),

            power:            f.power,
            toughness:        f.toughness,
            loyalty:          f.loyalty,
            defense:          f.defense,
            handModifier:     f.hand_modifier,
            lifeModifier:     f.life_modifier,
            attractionLights: f.attraction_lights,

            oracle: {
                name:     f.name,
                text:     purifyText(f.oracle_text),
                typeline: f.type_line ?? '',
            },

            unified: {
                name:     f.flavor_name === f.name ? f.name : f.printed_name ?? f.name,
                text:     purifyText(f.printed_text ?? f.oracle_text),
                typeline: (f.printed_type_line ?? f.type_line ?? '').replace(/ ～/, '～'),
            },

            printed: {
                name:     f.flavor_name === f.name ? f.name : f.printed_name ?? f.name,
                text:     purifyText(f.printed_text ?? f.oracle_text),
                typeline: (f.printed_type_line ?? f.type_line ?? '').replace(/ ～/, '～'),
            },

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

        relatedCards: [],
        rulings:      [],

        keywords:       data.keywords.map(v => toIdentifier(v)),
        counters:       cardFaces.some(c => (c.oracle_text ?? '').includes('counter')) ? [] : undefined,
        producibleMana: data.produced_mana != null
            ? convertMana(data.produced_mana)
            : undefined,
        tags: [
            ...data.reserved ? ['reserved'] : [],
            ...cardFaces.some(c => /\bcreates?|embalm|eternalize\b/i.test(c.oracle_text ?? '')) ? ['dev:token'] : [],
            ...cardFaces.some(c => /\bcounters?\b/.test(c.oracle_text ?? '')) ? ['dev:counter'] : [],
        ],
        localTags: [
            ...data.full_art ? ['full-art'] : [],
            ...data.oversized ? ['oversized'] : [],
            ...data.story_spotlight ? ['story-spotlight'] : [],
            ...data.textless ? ['textless'] : [],
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

        legalities:     {},
        inBooster:      data.booster,
        contentWarning: data.content_warning,
        games:          data.games,

        preview: data.preview != null
            ? {
                date:   data.preview.previewed_at,
                source: data.preview.source,
                uri:    data.preview.source_uri,
            }
            : undefined,

        scryfall: {
            cardId:    data.id,
            oracleId:  data.oracle_id,
            face:      data.face,
            imageUris: data.image_uris != null ? [data.image_uris] : data.card_faces.map(v => v.image_uris ?? {}),
        },
        arenaId:      data.arena_id,
        mtgoId:       data.mtgo_id,
        mtgoFoilId:   data.mtgo_foil_id,
        multiverseId: data.multiverse_ids,
        tcgPlayerId:  data.tcgplayer_id,
        cardMarketId: data.cardmarket_id,
    };
}

function assign(card: Document & ICard, data: ICard, key: keyof ICard, updation: ICardUpdation[]) {
    if (!isEqual(card[key], data[key])) {
        updation.push({
            cardId:     card.cardId,
            scryfallId: card.scryfall.cardId!,
            key,
            oldValue:   card[key],
            newValue:   data[key],
        });

        (card as any)[key] = data[key];
    }
}

function assignPart(
    card: ICard['parts'][0],
    data: ICard['parts'][0],
    key: keyof ICard['parts'][0],
    cardId: string,
    scryfallId: string,
    index: number,
    updation: ICardUpdation[],
) {
    if (!isEqual(card[key], data[key])) {
        updation.push({
            cardId,
            scryfallId,
            key:       `parts.${key}`,
            partIndex: index,
            oldValue:  card[key],
            newValue:  data[key],
        });

        (card as any)[key] = data[key];
    }
}

function assignSet(card: string[], data: string[], tag: string) {
    if (data.includes(tag) && !card.includes(tag)) {
        card.push(tag);
    }

    if (!data.includes(tag) && card.includes(tag)) {
        card.splice(card.indexOf(tag), 1);
    }
}

async function merge(card: Document & ICard, data: ICard) {
    const updation: ICardUpdation[] = [];

    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
        case 'number':
        case 'manaValue':
        case 'colorIdentity':
            assign(card, data, k, updation);
            break;

        case 'parts': {
            if (card.parts.length !== data.parts.length) {
                throw new Error(`parts count mismatch: ${card.cardId}`);
            }

            for (let i = 0; i < data.parts.length; i += 1) {
                const cPart = card.parts[i];
                const dPart = data.parts[i];

                for (const l of Object.keys(dPart) as (keyof ICard['parts'][0])[]) {
                    // eslint-disable-next-line default-case
                    switch (l) {
                    case '__costMap':
                    case 'flavorName':
                    case 'flavorText':
                        break;
                    case 'cost':
                    case 'color':
                    case 'colorIndicator':
                    case 'typeSuper':
                    case 'typeMain':
                    case 'typeSub':
                    case 'power':
                    case 'toughness':
                    case 'loyalty':
                    case 'defense':
                    case 'handModifier':
                    case 'lifeModifier':
                    case 'attractionLights':
                    case 'scryfallIllusId':
                    case 'artist':
                    case 'watermark':
                        assignPart(cPart, dPart, l, card.cardId, card.scryfall.cardId!, i, updation);
                        break;

                    case 'oracle': {
                        if (cPart.oracle.name !== dPart.oracle.name) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.name = cPart.oracle.name;
                            cPart.oracle.name = dPart.oracle.name;

                            if (card.lang === 'en') {
                                cPart.unified.name = dPart.oracle.name;
                            }
                        }

                        if (cPart.oracle.typeline !== dPart.oracle.typeline) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.typeline = cPart.oracle.typeline;
                            cPart.oracle.typeline = dPart.oracle.typeline;

                            if (card.lang === 'en') {
                                cPart.unified.typeline = dPart.oracle.typeline;
                            }
                        }

                        if (cPart.oracle.text !== dPart.oracle.text) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.text = cPart.oracle.text;
                            cPart.oracle.text = dPart.oracle.text;

                            if (card.lang === 'en') {
                                cPart.unified.text = dPart.oracle.text;
                            }
                        }

                        break;
                    }

                    case 'unified':
                    case 'printed':
                        break;
                    }
                }
            }

            break;
        }

        case 'relatedCards':
            break;

        case 'rulings':
            break;

        case 'keywords':
        case 'producibleMana':
            assign(card, data, k, updation);
            break;

        case 'counters':
            break;

        case 'tags':
            if (!isEqual(card[k], data[k])) {
                updation.push({
                    cardId:     card.cardId,
                    scryfallId: card.scryfall.cardId!,
                    key:        k,
                    oldValue:   card[k],
                    newValue:   data[k],
                });
            }

            assignSet(card.tags, data.tags, 'reserved');
            assignSet(card.tags, data.tags, 'dev:counted');
            assignSet(card.tags, data.tags, 'dev:counted');
            break;

        case 'localTags':
            if (!isEqual(card[k], data[k])) {
                updation.push({
                    cardId:     card.cardId,
                    scryfallId: card.scryfall.cardId!,
                    key:        k,
                    oldValue:   card[k],
                    newValue:   data[k],
                });
            }

            assignSet(card.localTags, data.localTags, 'full-art');
            assignSet(card.localTags, data.localTags, 'oversized');
            assignSet(card.localTags, data.localTags, 'story-spotlight');
            assignSet(card.localTags, data.localTags, 'textless');
            break;

        case 'category':
        case 'layout':
        case 'rarity':
            break;
        case 'frame':
        case 'frameEffects':
        case 'borderColor':
        case 'cardBack':
        case 'securityStamp':
        case 'promoTypes':
        case 'releaseDate':
            assign(card, data, k, updation);
            break;

        case 'isDigital':
        case 'isPromo':
        case 'isReprint':
        case 'finishes':
            assign(card, data, k, updation);
            break;
        case 'hasHighResImage': {
            if (card.hasHighResImage !== data.hasHighResImage) {
                for (const type of ['png', 'border_crop', 'art_crop', 'large', 'normal', 'small']) {
                    const basePath = cardImagePath(type, data.set, data.lang, data.number);

                    if (existsSync(basePath)) {
                        unlinkSync(basePath);
                    }

                    for (let i = 0; i < data.parts.length; i += 1) {
                        const partPath = cardImagePath(type, data.set, data.lang, data.number, i);

                        if (existsSync(partPath)) {
                            unlinkSync(partPath);
                        }
                    }
                }

                card.hasHighResImage = data.hasHighResImage;
            }
            break;
        }
        case 'imageStatus':
            assign(card, data, 'imageStatus', updation);
            break;

        case 'legalities':
            break;
        case 'inBooster':
        case 'contentWarning':
        case 'games':
            assign(card, data, k, updation);
            break;

        case 'preview':
            break;

        case 'scryfall':
        case 'arenaId':
        case 'mtgoId':
        case 'mtgoFoilId':
        case 'multiverseId':
        case 'tcgPlayerId':
        case 'cardMarketId':
            assign(card, data, k, updation);
            break;

        case '__oracle':
            assign(card, data, '__oracle', updation);
            break;
        }
    }

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }

    await CardUpdation.insertMany(updation);
}

const bucketSize = 500;

export default class CardLoader extends Task<Status> {
    file: string;
    filePath: string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        // initialize set code map
        const setCodeMap: Record<string, string> = {};

        const sets = await Set.find();

        for (const set of sets) {
            if (set.setId !== set.scryfall.code) {
                setCodeMap[set.scryfall.code] = set.setId;
            }
        }

        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type:   'card',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        // evaluate total card count
        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                total += 1;
            }
        }

        this.lineReader.reset();

        await SCard.deleteMany({});

        start = Date.now();

        for await (const jsons of toAsyncBucket(
            convertJson<RawCard>(this.lineReader.get()),
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            await SCard.insertMany(jsons.map(json => ({
                ...omit(json, 'id'),
                card_id: json.id,
            })));

            const cards = await Card.find({ 'scryfall.cardId': { $in: jsons.map(j => j.id) } });

            const cardsToInsert: ICard[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series') {
                    continue;
                }

                const newCards = splitDFT(toNSCard(json as RawCardNoArtSeries));

                const oldCards = cards.filter(c => c.scryfall.cardId === json.id
                    || (c.set === json.set && c.number === json.collector_number && c.lang === json.lang));

                if (newCards.length === 1) {
                    // a single card
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(c => toCard(c, setCodeMap)));
                    } else if (oldCards.length === 1) {
                        merge(oldCards[0], toCard(newCards[0], setCodeMap));
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (newCards[0].id === 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            continue;
                        }

                        console.log(`mismatch object count: ${newCards[0].id}`);
                    }
                } else if (newCards.length === 2) {
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(c => toCard(c, setCodeMap)));
                    } else if (oldCards.length === 1 || oldCards.length === 2) {
                        for (const n of newCards) {
                            if (n.face != null) {
                                const old = oldCards.find(c => c.scryfall.face === n.face);

                                if (old != null) {
                                    merge(old, toCard(n, setCodeMap));
                                } else {
                                    cardsToInsert.push(toCard(n, setCodeMap));
                                }
                            } else {
                                // eslint-disable-next-line no-debugger
                                debugger;
                            }
                        }
                    } else {
                        console.log(`mismatch object count: ${newCards[0].id}, ${newCards[1].id}`);
                    }
                }

                count += 1;
            }

            for (const card of cardsToInsert) {
                if (card.lang !== 'en') {
                    continue;
                }

                if (card.set === 'plst' || card.set === 'pagl') {
                    card.localTags.push('dev:printed');
                    continue;
                }

                if (card.parts.some(p => /[(（)）]/.test(p.oracle.text ?? '')
                        || /[(（)）]/.test(p.printed.text ?? ''))
                ) {
                    card.localTags.push('dev:printed');
                }
            }

            await Card.insertMany(cardsToInsert);
        }
    }

    stopImpl(): void { /* no-op */ }
}
