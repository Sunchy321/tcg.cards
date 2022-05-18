/* eslint-disable camelcase */
import Task from '@/common/task';

import Card, { ICard } from '@/magic/db/card';
import SCard from '@/magic/db/scryfall-card';
import Set from '@/magic/db/set';

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
    convertColor, parseTypeline, toIdentifier, convertLegality,
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
};

type NCardBase = Omit<RawCard, Exclude<keyof NCardFace, 'image_uris'> | 'card_faces' | 'layout'> & {
    card_faces: NCardFace[];
    face?: 'back' | 'front';
};

type NCardFaceExtracted = NCardBase & { layout: RawCardNoArtSeries['layout'] };
type NCardSplit = NCardBase & { layout: Exclude<NCardFaceExtracted['layout'], 'double_faced_token'> | 'minigame' };

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
    return text?.replace(/\{½\}/g, '{H1}');
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

            hand_modifier: card.hand_modifier,
            life_modifier: card.life_modifier,

            flavor_name: card.flavor_name,
        }];
    }
}

function toNSCard(card: RawCardNoArtSeries): NCardFaceExtracted {
    return { ...card, card_faces: extractCardFace(card) };
}

function splitDFT(card: NCardFaceExtracted): NCardSplit[] {
    if (isMinigame(card)) {
        return [{ ...card, layout: 'minigame' }];
    }

    if (card.card_faces[0]?.name === 'Day' && card.card_faces[1]?.name === 'Night') {
        return [{ ...card, layout: 'token' }];
    }

    if (card.layout === 'double_faced_token') {
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

    if (data.layout === 'token') {
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
                || ['gold', 'clue', 'treasure', 'food'].includes(baseId)
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

            power:        f.power,
            toughness:    f.toughness,
            loyalty:      f.loyalty,
            handModifier: f.hand_modifier,
            lifeModifier: f.life_modifier,

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
            ? convertColor(data.produced_mana)
            : undefined,
        tags: [
            ...cardFaces.some(c => /\bcreates?\b/.test(c.oracle_text ?? '')) ? ['dev:token'] : [],
            ...cardFaces.some(c => /\bcounters?\b/.test(c.oracle_text ?? '')) ? ['dev:counter'] : [],
        ],
        localTags: [],

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

            return data.layout;
        })(),

        frame:        data.frame,
        frameEffects: data.frame_effects ?? [],
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
        finishes:         data.finishes,
        hasHighResImage:  data.highres_image,
        imageStatus:      data.image_status,

        legalities:     convertLegality(data.legalities),
        isReserved:     data.reserved,
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

function assign(card: Document & ICard, data: ICard, key: keyof ICard) {
    if (!isEqual(card[key], data[key])) {
        (card as any)[key] = data[key];
    }
}

function assignPart(card: ICard['parts'][0], data: ICard['parts'][0], key: keyof ICard['parts'][0]) {
    if (!isEqual(card[key], data[key])) {
        (card as any)[key] = data[key];
    }
}

async function merge(card: Document & ICard, data: ICard) {
    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
            assign(card, data, 'set');
            break;
        case 'number':
            assign(card, data, 'number');
            break;

        case 'manaValue':
            break;
        case 'colorIdentity':
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
                    case 'cost':
                    case '__costMap':
                    case 'color':
                        break;
                    case 'colorIndicator':
                        assignPart(cPart, dPart, 'colorIndicator');
                        break;

                    case 'typeSuper': {
                        if (!isEqual(cPart.typeSuper, dPart.typeSuper)) {
                            cPart.typeSuper = dPart.typeSuper;
                        }
                        break;
                    }
                    case 'typeMain': {
                        if (!isEqual(cPart.typeMain, dPart.typeMain)) {
                            cPart.typeMain = dPart.typeMain;
                        }
                        break;
                    }
                    case 'typeSub': {
                        if (!isEqual(cPart.typeSub, dPart.typeSub)) {
                            cPart.typeSub = dPart.typeSub;
                        }
                        break;
                    }

                    case 'power':
                    case 'toughness':
                    case 'loyalty':
                    case 'handModifier':
                    case 'lifeModifier':
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

                    case 'scryfallIllusId':
                        assignPart(cPart, dPart, 'scryfallIllusId');
                        break;
                    case 'flavorName':
                        break;
                    case 'flavorText':
                        break;
                    case 'artist':
                        assignPart(cPart, dPart, 'artist');
                        break;
                    case 'watermark':
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
            assign(card, data, 'keywords');
            break;

        case 'counters':
        case 'producibleMana':
            break;

        case 'tags':
            if (data.__oracle?.text != null) {
                if (data.tags.includes('dev:token')) {
                    card.tags.push('dev:token');
                }

                if (data.tags.includes('dev:counter')) {
                    card.tags.push('dev:counter');
                }
            }
            break;

        case 'localTags':
            break;

        case 'category':
        case 'layout':
            break;
        case 'frame':
            assign(card, data, 'frame');
            break;
        case 'frameEffects':
            assign(card, data, 'frameEffects');
            break;
        case 'borderColor':
            assign(card, data, 'borderColor');
            break;
        case 'cardBack':
            break;
        case 'promoTypes':
            assign(card, data, 'promoTypes');
            break;
        case 'rarity':
            break;
        case 'releaseDate':
            assign(card, data, 'releaseDate');
            break;

        case 'isDigital':
            assign(card, data, 'isDigital');
            break;
        case 'isFullArt':
            assign(card, data, 'isFullArt');
            break;
        case 'isOversized':
            assign(card, data, 'isOversized');
            break;
        case 'isPromo':
            assign(card, data, 'isPromo');
            break;
        case 'isReprint':
            assign(card, data, 'isReprint');
            break;
        case 'isStorySpotlight':
            assign(card, data, 'isStorySpotlight');
            break;
        case 'isTextless':
            assign(card, data, 'isTextless');
            break;
        case 'finishes':
            assign(card, data, 'finishes');
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
            assign(card, data, 'imageStatus');
            break;

        case 'legalities':
            break;
        case 'isReserved':
            assign(card, data, 'isReserved');
            break;
        case 'inBooster':
            assign(card, data, 'inBooster');
            break;
        case 'contentWarning':
            assign(card, data, 'contentWarning');
            break;
        case 'games':
            assign(card, data, 'games');
            break;

        case 'preview':
            break;

        case 'scryfall':
            assign(card, data, 'scryfall');
            break;

        case 'arenaId':
            assign(card, data, 'arenaId');
            break;
        case 'mtgoId':
            assign(card, data, 'mtgoId');
            break;
        case 'mtgoFoilId':
            assign(card, data, 'mtgoFoilId');
            break;
        case 'multiverseId':
            assign(card, data, 'multiverseId');
            break;
        case 'tcgPlayerId':
            assign(card, data, 'tcgPlayerId');
            break;
        case 'cardMarketId':
            assign(card, data, 'cardMarketId');
            break;

        case '__oracle':
            assign(card, data, '__oracle');
            break;
        }
    }

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }
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

                const oldCards = cards.filter(c => c.scryfall.cardId === json.id);

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
                            if (n.face === 'front') {
                                const front = oldCards.find(c => c.scryfall.face === 'front');

                                if (front != null) {
                                    merge(front, toCard(n, setCodeMap));
                                } else {
                                    cardsToInsert.push(toCard(n, setCodeMap));
                                }
                            } else {
                                const back = oldCards.find(c => c.scryfall.face === 'back');

                                if (back != null) {
                                    merge(back, toCard(n, setCodeMap));
                                } else {
                                    cardsToInsert.push(toCard(n, setCodeMap));
                                }
                            }
                        }
                    } else {
                        console.log(`mismatch object count: ${newCards[0].id}, ${newCards[1].id}`);
                    }
                }

                count += 1;
            }

            for (const card of cardsToInsert) {
                if (card.lang === 'en') {
                    card.localTags.push('dev:printed');
                }
            }

            await Card.insertMany(cardsToInsert);
        }
    }

    stopImpl(): void { /* no-op */ }
}
