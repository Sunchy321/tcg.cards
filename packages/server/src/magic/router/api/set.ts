import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set from '@/magic/db/set';
import { SetLocalization } from '@interface/magic/set';

import { existsSync, readdirSync } from 'fs';
import { mapValues, omit } from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';

import { cardImageBase } from '@/magic/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id != null) {
        const set = await Set.findOne({ setId: id });

        if (set != null) {
            const json = set.toJSON();

            ctx.body = {
                ...json,
                localization: Object.fromEntries(json.localization.map(l => [l.lang, omit(l, ['lang'])])),
            };
        }

        return;
    }

    ctx.body = await Set.find().sort({ releaseDate: 1 }).distinct('setId');
});

interface SetProfile {
    setId: string;
    parent?: string;
    localization: Record<string, Omit<SetLocalization, 'lang'>>;
    setType: string;
    releaseDate?: string;
}

router.get('/profile', async ctx => {
    const ids = toMultiple(ctx.query.ids ?? '');

    if (ids == null) {
        ctx.status = 400;
        return;
    }

    const sets = await Set.find({ setId: { $in: ids } });

    const result: Record<string, SetProfile> = {};

    for (const s of sets) {
        result[s.setId] = {
            setId:        s.setId,
            parent:       s.parent,
            localization: Object.fromEntries(s.toJSON().localization.map(l => [l.lang, omit(l, ['lang'])])),
            setType:      s.setType,
            releaseDate:  s.releaseDate,
        };
    }

    ctx.body = result;
});

router.get('/image-all', async ctx => {
    const { id, lang, type } = mapValues(ctx.query, toSingle);

    if (id == null || lang == null || type == null) {
        ctx.status = 400;
        return;
    }

    const path = cardImageBase(type, id, lang);

    if (existsSync(path)) {
        ctx.body = readdirSync(path)
            .filter(v => v.endsWith('.png') || v.endsWith('.jpg'))
            .map(v => v.replace(/\..*$/, ''))
            .sort((a, b) => {
                const aLong = a.padStart(10, '0');
                const bLong = b.padStart(10, '0');

                return aLong < bLong ? -1 : 1;
            });
    } else {
        ctx.status = 404;
    }
});

export default router;
