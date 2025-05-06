import { Card as ICard } from '@interface/yugioh/card';

import { Card as HCard } from '@interface/yugioh/ygocdb/card';

function getId(data: HCard): ICard['cardId'] {
    return data.cid.toString();
}

export type CCard = Pick<ICard, 'cardId' | 'localization'>;

export function toCard(data: HCard): CCard {
    const text = data.text.pdesc != '' ? data.text.pdesc + '\n\n' + data.text.desc : data.text.desc;

    const localization = [
        {
            lang:     'zhs:pro',
            lastDate: '',
            name:     data.cn_name,
            typeline: data.text.types,
            text,
        },
        {
            lang:     'zhs:nw',
            lastDate: '',
            name:     data.nwbbs_n,
            typeline: data.text.types,
            text,
        },
        {
            lang:     'zhs:cn',
            lastDate: '',
            name:     data.cnocg_n,
            typeline: data.text.types,
            text,
        },
        {
            lang:     'zhs:md',
            lastDate: '',
            name:     data.md_name,
            typeline: data.text.types,
            text,
        },
    ];

    return {
        cardId: getId(data),

        localization,
    };
}
