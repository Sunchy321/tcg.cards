import { Card as ICard, MainType, SubType } from '@interface/ptcg/card';
import { Print as IPrint, Rarity } from '@interface/ptcg/print';

import { Entry } from '@interface/ptcg/database/entry';

import { toIdentifier } from '@common/util/id';

import { castArray } from 'lodash';

type CardPrint = { card: ICard, print: IPrint };

function getId(data: Entry): string {
    return toIdentifier(data.name);
}

const typeMap: Record<string, [MainType, SubType | undefined]> = {
    '(Item)':         ['trainer', undefined],
    'Basic Energy':   ['energy', 'basic'],
    'Item':           ['trainer', 'item'],
    'Pokémon':        ['pokemon', undefined],
    'Pokémon Tool':   ['trainer', 'item'],
    'Special Energy': ['energy', 'special'],
    'Stadium':        ['trainer', 'stadium'],
    'Supporter':      ['trainer', 'supporter'],
    'Tool':           ['trainer', 'item'],
    'グッズ':            ['trainer', 'item'],
    'サポート':           ['trainer', 'supporter'],
    'スタジアム':          ['trainer', 'stadium'],
    'トレーナー':          ['trainer', 'item'], // ONLY ONE CARD
    'ポケモンのどうぐ':       ['trainer', 'item'],
    'ワザマシン':          ['trainer', 'technical_machine'],
    '基本エネルギー':        ['energy', 'basic'],
    '基本能量卡':          ['energy', 'basic'],
    '寶可夢道具':          ['trainer', 'item'],
    '支援者卡':           ['trainer', 'supporter'],
    '物品卡':            ['trainer', 'item'],
    '特殊エネルギー':        ['energy', 'special'],
    '特殊能量卡':          ['energy', 'special'],
    '競技場卡':           ['trainer', 'stadium'],
};

const rarityMap: Record<string, string> = {
    '1 diamond':                           '1 diamond',
    '1 star':                              '1 star',
    '2 diamond':                           '2 diamond',
    '2 star':                              '2 star',
    '3 diamond':                           '3 diamond',
    '3 star':                              '3 star',
    '4 diamond':                           '4 diamond',
    'ACE SPEC Rare':                       'ACE SPEC Rare',
    'Amazing Rare':                        'Amazing Rare',
    'Common':                              'Common',
    'Double Rare':                         'Double Rare',
    'Holo Rare V':                         'Holo Rare V',
    'Holo Rare VMAX':                      'Holo Rare VMAX',
    'Holo Rare VSTAR':                     'Holo Rare VSTAR',
    'Hyper Rare':                          'Hyper Rare',
    'Illustration Rare':                   'Illustration Rare',
    'LEGEND':                              'LEGEND',
    'No Rarity':                           'No Rarity',
    'Promo':                               'Promo',
    'Radiant Rare':                        'Radiant Rare',
    'Rainbow Rare':                        'Rainbow Rare',
    'Rare':                                'Rare',
    'Rare BREAK':                          'Rare BREAK',
    'Rare Holo':                           'Rare Holo',
    'Rare Holo EX':                        'Rare Holo EX',
    'Rare Holo GX':                        'Rare Holo GX',
    'Rare Holo LV.X':                      'Rare Holo LV.X',
    'Rare Holo Star':                      'Rare Holo Star',
    'Rare Holo ex':                        'Rare Holo ex',
    'Rare Prime':                          'Rare Prime',
    'Rare Prism Star':                     'Rare Prism Star',
    'Rare Secret':                         'Rare Secret',
    'Rare Shining':                        'Rare Shining',
    'Rare Shiny GX':                       'Rare Shiny GX',
    'Shiny Rare':                          'Shiny Rare',
    'Shiny Rare V or VMAX':                'Shiny Rare V or VMAX',
    'Shiny Ultra Rare':                    'Shiny Ultra Rare',
    'Special Illustration Rare':           'Special Illustration Rare',
    'Trainer Gallery Holo Rare':           'Trainer Gallery Holo Rare',
    'Trainer Gallery Holo Rare V':         'Trainer Gallery Holo Rare V',
    'Trainer Gallery Holo Rare V or VMAX': 'Trainer Gallery Holo Rare V or VMAX',
    'Trainer Gallery Secret Rare':         'Trainer Gallery Secret Rare',
    'Trainer Gallery Ultra Rare':          'Trainer Gallery Ultra Rare',
    'Ultra Rare':                          'Ultra Rare',
    'Uncommon':                            'Uncommon',
    'crown':                               'crown',
    'hikaru':                              'hikaru',
    'prismstar':                           'prismstar',
    'promo':                               'promo',
    'rare_ar':                             'rare_ar',
    'rare_c':                              'rare_c',
    'rare_c2':                             'rare_c2',
    'rare_c_c':                            'rare_c_c',
    'rare_chr':                            'rare_chr',
    'rare_csr':                            'rare_csr',
    'rare_hr':                             'rare_hr',
    'rare_r':                              'rare_r',
    'rare_r_c':                            'rare_r_c',
    'rare_rr':                             'rare_rr',
    'rare_s':                              'rare_s',
    'rare_s_2':                            'rare_s_2',
    'rare_sar':                            'rare_sar',
    'rare_sr_c':                           'rare_sr_c',
    'rare_ss':                             'rare_ss',
    'rare_ssr':                            'rare_ssr',
    'rare_tr':                             'rare_tr',
    'rare_u':                              'rare_u',
    'rare_u2':                             'rare_u2',
    'rare_u_c':                            'rare_u_c',
    'rare_ur_c':                           'rare_ur_c',
};

export function toCard(
    data: Entry,
    lang: string,
): CardPrint {
    const loc = {
        name: data.name,
        text: data.effect ?? '',
    };

    const [main, sub] = typeMap[data.card_type] ?? ['pokemon', undefined];

    return {
        card: {
            cardId: getId(data),

            ...lang === 'en'
                ? loc
                : {
                    name:     '',
                    typeline: '',
                    text:     '',
                },

            type: { main, ...sub != null ? { sub } : {} },

            hp: data.hp != null ? Number(data.hp) : undefined,

            localization: [{ lang, __lastDate: data.date ?? '', ...loc }],

            tags: [],

            category:   'normal',
            legalities: {},
        },
        print: {
            cardId: getId(data),

            lang,
            set:    data.set_code ?? '',
            number: data.number ?? '',

            ...loc,

            flavorText: data.flavor_text,
            artist:     castArray(data.author ?? []),

            imageUrl: data.img,

            layout:      'normal',
            rarity:      rarityMap[data.rarity ?? ''] as Rarity,
            releaseDate: data.date ?? '',

            tags: [],
        },
    };
}
