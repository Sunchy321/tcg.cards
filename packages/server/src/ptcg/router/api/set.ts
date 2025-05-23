import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set from '@/ptcg/db/set';
import { SetLocalization } from '@interface/ptcg/set';

import { mapValues, omit } from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';

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
    setId:            string;
    parent?:          string;
    localization:     Record<string, Omit<SetLocalization, 'lang'>>;
    type:             string;
    symbolStyle?:     string[];
    doubleFacedIcon?: string[];
    releaseDate?:     string;
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
            localization: Object.fromEntries(s.toJSON().localization.map(l => [l.lang, omit(l, ['lang'])])),
            type:         s.type,
            releaseDate:  s.releaseDate,
        };
    }

    ctx.body = result;
});

export default router;
