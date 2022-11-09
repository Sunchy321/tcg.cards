import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Patch from '@/hearthstone/db/patch';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/patch');

router.get('/', async ctx => {
    const { version } = mapValues(ctx.query, toSingle);

    if (version == null) {
        const patches = await Patch.find().sort({ number: -1 });
        ctx.body = patches.map(p => p.toJSON());
        return;
    }

    const patch = await Patch.findOne({ version });

    if (patch != null) {
        const json = patch.toJSON();

        ctx.body = json;
    }
});

// interface SetProfile {
//     setId: string;
//     parent?: string;
//     // localization: Record<string, Omit<SetLocalization, 'lang'>>;
//     setType: string;
//     symbolStyle?: string[];
//     doubleFacedIcon?: string[];
//     releaseDate?: string;
// }

// router.get('/profile', async ctx => {
//     const ids = toMultiple(ctx.query.ids ?? '');

//     if (ids == null) {
//         ctx.status = 400;
//         return;
//     }

//     const sets = await Set.find({ setId: { $in: ids } });

//     const result: Record<string, SetProfile> = {};

//     for (const s of sets) {
//         result[s.setId] = {
//             setId:           s.setId,
//             parent:          s.parent,
//             localization:    Object.fromEntries(s.toJSON().localization.map(l => [l.lang, omit(l, ['lang'])])),
//             setType:         s.setType,
//             symbolStyle:     s.symbolStyle,
//             doubleFacedIcon: s.doubleFacedIcon,
//             releaseDate:     s.releaseDate,
//         };
//     }

//     ctx.body = result;
// });

export default router;
