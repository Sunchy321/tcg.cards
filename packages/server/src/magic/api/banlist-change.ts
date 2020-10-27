import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import BanlistChange from '../db/banlist-change';

import parseBanlist from '../parse-banlist';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/banlist-change');

router.get('/outlines',
    jwtAuth({ admin: true }),
    async ctx => {
        const banlistChanges = await BanlistChange.find().sort({ date: -1 });

        ctx.body = banlistChanges.map(c => ({
            id:   c._id,
            date: c.date,
        }));
    },
);

router.get('/raw',
    jwtAuth({ admin: true }),
    async ctx => {
        const id = ctx.query.id;

        const change = await BanlistChange.findById(id);

        if (change != null) {
            ctx.body = change.toObject({ versionKey: false });
        }
    },
);

router.get('/parse',
    jwtAuth({ admin: true }),
    async ctx => {
        const url = ctx.query.url;

        ctx.body = await parseBanlist(url);
    },
);

router.post('/save',
    jwtAuth({ admin: true }),
    async ctx => {
        const data = ctx.request.body.data;

        BanlistChange.findOneAndUpdate();

        if (data._id == null) {
            await BanlistChange.create(data);
        } else {
            await BanlistChange.findByIdAndUpdate(data._id, data);
        }

        ctx.status = 200;
    },
);

export default router;
