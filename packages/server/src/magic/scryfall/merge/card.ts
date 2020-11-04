import { ProgressHandler } from '@/common/progress';

import ScryfallCard, { ICard as IScryfallCard } from '../../db/scryfall/card';
import Card, { ICard } from '../../db/card';

import { convertColor, parseTypeline, toIdentifier, convertLegality } from '@/magic/util';
import { CardFace, Colors, IStatus } from '../interface';
import toBucket from '@/common/to-bucket';
import { Document } from 'mongoose';

type NewCardFace = Omit<CardFace, 'colors'> & {
    colors: Colors,
    // eslint-disable-next-line camelcase
    hand_modifier?: string,
    // eslint-disable-next-line camelcase
    life_modifier?: string,

    // eslint-disable-next-line camelcase
    flavor_name?: string,
}

type NewScryfallCard =
    Omit<IScryfallCard, 'card_faces' | keyof NewCardFace> & {
        // eslint-disable-next-line camelcase
        card_faces: NewCardFace[]
    }

function extractCardFace(card: IScryfallCard): NewCardFace[] {
    if (card.card_faces != null) {
        return card.card_faces.map(f => {
            if (f.colors == null) {
                return { ...f, colors: card.colors! } as NewCardFace;
            } else {
                return f as NewCardFace;
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

function convertScryfallCard(card: IScryfallCard): NewScryfallCard {
    return {
        ...card,
        card_faces: extractCardFace(card),
    };
}

async function mergeWith(
    data: IScryfallCard,
    card: (ICard & Document) | undefined,
): Promise<ICard | undefined> {
    const newData = convertScryfallCard(data);

    if (card == null) {
        const object: ICard = {
            cardId: toIdentifier(data.name),

            setId:  newData.set_id,
            number: newData.collector_number,
            lang:   newData.lang,

            cmc:           newData.cmc,
            colorIdentity: convertColor(newData.color_identity),

            parts: newData.card_faces.map(f => ({
                cost: f.mana_cost,

                color:          convertColor(f.colors),
                colorIndicator: f.color_indicator != null
                    ? convertColor(f.color_indicator)
                    : undefined,

                ...parseTypeline(f.type_line),

                power:         f.power,
                toughness:     f.toughness,
                loyalty:       f.loyalty,
                hand_modifier: f.hand_modifier,
                life_modifier: f.life_modifier,

                oracle: {
                    name:     f.name,
                    text:     f.oracle_text,
                    typeline: f.type_line,
                },

                unified: {
                    name:     f.printed_name || f.name,
                    text:     f.printed_text || f.oracle_text,
                    typeline: f.printed_type_line || f.type_line,
                },

                printed: {
                    name:     f.printed_name || f.name,
                    text:     f.printed_text || f.oracle_text,
                    typeline: f.printed_type_line || f.type_line,
                },

                scryfallIllusId: f.illustration_id,
                flavorName:      f.flavor_name,
                flavorText:      f.flavor_text,
                artist:          f.artist,
                watermark:       f.watermark,
            })),

            // TODO postprocess
            relatedCards: newData.all_parts?.map(p => ({
                relation: p.component,
                id:       p.id,
                name:     p.name,
            })),

            keywords:     newData.keywords,
            producedMana: newData.produced_mana != null
                ? convertColor(newData.produced_mana)
                : undefined,

            layout:       newData.layout,
            frame:        newData.frame,
            frameEffects: newData.frame_effects,
            borderColor:  newData.border_color,
            cardBack:     newData.card_back_id,
            promoTypes:   newData.promo_types,
            rarity:       newData.rarity,
            releaseDate:  newData.released_at,

            isDigital:        newData.digital,
            isFullArt:        newData.full_art,
            isOversized:      newData.oversized,
            isPromo:          newData.promo,
            isReprint:        newData.reprint,
            isStorySpotlight: newData.story_spotlight,
            isTextless:       newData.textless,
            hasFoil:          newData.foil,
            hasNonfoil:       newData.nonfoil,

            legalities:     convertLegality(newData.legalities),
            isReserved:     newData.reserved,
            inBooster:      newData.booster,
            contentWarning: newData.content_warning,
            games:          newData.games,

            preview: newData.preview != null ? {
                date:   newData.preview.previewed_at,
                source: newData.preview.source,
                uri:    newData.preview.source_uri,
            } : undefined,

            scryfall: {
                cardId:   newData.card_id,
                oracleId: newData.oracle_id,
            },
            arenaId:      newData.arena_id,
            mtgoId:       newData.mtgo_id,
            mtgoFoilId:   newData.mtgo_foil_id,
            multiverseId: newData.multiverse_ids,
            tcgPlayerId:  newData.tcgplayer_id,
            cardMarketId: newData.cardmarket_id,
            edhredRank:   newData.edhrec_rank,
        };

        return object;
    } else {
        card.arenaId = newData.arena_id;
        card.scryfall.cardId = newData.card_id;
        card.lang = newData.lang;
        card.mtgoId = newData.mtgo_id;
        card.mtgoFoilId = newData.mtgo_foil_id;
        card.multiverseId = newData.multiverse_ids;
        card.tcgPlayerId = newData.tcgplayer_id;
        card.cardMarketId = newData.cardmarket_id;
        card.scryfall.oracleId = newData.oracle_id;

        // all_parts ignore

        for (let i = 0; i < card.parts.length; ++i) {
            const part = card.parts[i];
            const newPart = newData.card_faces[i];

            part.artist = newPart.artist;

            part.colorIndicator = newPart.color_indicator != null
                ? convertColor(newPart.color_indicator) : undefined;

            part.color = convertColor(newPart.colors);
            part.flavorText = newPart.flavor_text;
            part.scryfallIllusId = newPart.illustration_id;
            part.loyalty = newPart.loyalty;
            part.cost = newPart.mana_cost;
            part.power = newPart.power;
            part.toughness = newPart.toughness;
            part.watermark = newPart.watermark;

            part.oracle.name = newPart.name;
            part.oracle.text = newPart.oracle_text;
            part.oracle.typeline = newPart.type_line;

            part.printed.name = newPart.printed_name || newPart.name;
            part.printed.text = newPart.printed_text || newPart.oracle_text;
            part.printed.typeline = newPart.printed_type_line || newPart.type_line;

            part.handModifier = newPart.hand_modifier;
            part.lifeModifier = newPart.life_modifier;
            part.flavorName = newPart.flavor_name;
        }

        card.cmc = newData.cmc;
        card.colorIdentity = convertColor(newData.color_identity);
        card.edhredRank = newData.edhrec_rank;
        card.keywords = newData.keywords;
        card.layout = newData.layout;
        card.legalities = convertLegality(newData.legalities);
        card.isOversized = newData.oversized;
        card.hasFoil = newData.foil;
        card.hasNonfoil = newData.nonfoil;
        card.producedMana = newData.produced_mana != null
            ? convertColor(newData.produced_mana) : undefined;
        card.isReserved = newData.reserved;

        card.inBooster = newData.booster;
        card.borderColor = newData.border_color;
        card.cardBack = newData.card_back_id;
        card.number = newData.collector_number;
        card.contentWarning = newData.content_warning;
        card.isDigital = newData.digital;
        card.frameEffects = newData.frame_effects;
        card.frame = newData.frame;
        card.isFullArt = newData.full_art;
        card.games = newData.games;
        card.isPromo = newData.promo;
        card.promoTypes = newData.promo_types;
        card.rarity = newData.rarity;
        card.releaseDate = newData.released_at;
        card.isReprint = newData.reprint;
        card.setId = newData.set_id;
        card.isStorySpotlight = newData.story_spotlight;
        card.isTextless = newData.textless;

        if (data.preview) {
            card.preview = {
                date:   data.preview.previewed_at,
                source: data.preview.source,
                uri:    data.preview.source_uri,
            };
        } else {
            card.preview = undefined;
        }
    }
}

const bucketSize = 500;

export class CardMerger extends ProgressHandler<IStatus> {
    progressId?: NodeJS.Timeout;

    async action(): Promise<void> {
        let count = 0;

        const files = await ScryfallCard.aggregate([
            { $group: { _id: '$file' } },
            { $sort: { _id: -1 } },
        ]);

        const lastFile = files[0]._id;

        const total = await ScryfallCard.countDocuments({ file: lastFile });

        const start = Date.now();

        const postProgress = () => {
            const progress: IStatus = {
                method: 'merge',
                type:   'card',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            progress.time = {
                elapsed,
                remaining: elapsed / count * (total - count),
            };

            this.emitProgress(progress);
        };

        this.progressId = setInterval(postProgress, 500);

        const query = ScryfallCard.find({ file: lastFile }).lean();

        for await (const jsons of toBucket(
            query as unknown as AsyncGenerator<IScryfallCard>,
            bucketSize,
        )) {
            const cards = await Card.find({
                'scryfall.cardId': {
                    $in: jsons.map(j => j.card_id),
                },
            });

            const newCards: ICard[] = [];

            for (const json of jsons) {
                const card = cards.find(c => c.scryfall.cardId === json.card_id);

                const newCard = await mergeWith(json, card);

                if (newCard != null) {
                    newCards.push(newCard);
                }
            }

            await Card.insertMany(newCards);

            for (const c of cards) {
                await c.save();
            }

            count += jsons.length;
        }

        if (this.progressId != null) {
            postProgress();
            clearInterval(this.progressId);
            this.progressId = undefined;
        }
    }

    abort(): void {
        // TODO
    }

    equals(): boolean { return true; }
}
