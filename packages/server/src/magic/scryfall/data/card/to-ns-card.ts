/* eslint-disable camelcase */
import { Colors } from '@interface/magic/scryfall/basic';
import { CardFace, RawCard } from '@interface/magic/scryfall/card';

export type RawCardNoArtSeries = Omit<RawCard, 'layout'> & {
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

export function extractCardFace(card: RawCard): NCardFace[] {
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

export function toNSCard(card: RawCardNoArtSeries): NCardFaceExtracted {
    return { ...card, card_faces: extractCardFace(card) };
}
