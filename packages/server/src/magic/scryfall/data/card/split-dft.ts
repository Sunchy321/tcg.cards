import { NCardFaceExtracted } from './to-ns-card';

import { Colors } from '@interface/magic/scryfall/basic';
import { CardFace, RawCard } from '@interface/magic/scryfall/card';

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

type NCardSplit = NCardBase & {
    layout: Exclude<NCardFaceExtracted['layout'], 'double_faced_token'> | 'double_faced' | 'flip_token_bottom' | 'flip_token_top' | 'transform_token';
};

function isMinigame(data: NCardBase) {
    return data.set_name.endsWith('Minigames');
}

export function splitDFT(card: NCardFaceExtracted): NCardSplit[] {
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
