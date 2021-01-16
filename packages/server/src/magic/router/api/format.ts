import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import Format from '@/magic/db/format';
import FormatChange from '@/magic/db/format-change';
import BanlistChange from '@/magic/db/banlist-change';

import { syncChange } from '@/magic/change';
import parseBanlist from '@/magic/banlist/parse';
import { getWizardsBanlist } from '@/magic/banlist/get';

import { formats } from '@/../data/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.get('/', async ctx => {
    if (ctx.query.id == null) {
        const ids = await Format.find().distinct('formatId') as string[];

        ctx.body = ids.sort((a, b) => {
            const aIdx = formats.indexOf(a);
            const bIdx = formats.indexOf(b);

            if (aIdx !== -1) {
                if (bIdx !== -1) {
                    return aIdx - bIdx;
                } else {
                    return -1;
                }
            } else {
                if (bIdx !== -1) {
                    return 1;
                } else {
                    return a > b ? 1 : a < b ? -1 : 0;
                }
            }
        });
    } else {
        const format = await Format.findOne({ formatId: ctx.query.id });

        if (format == null) {
            ctx.status = 404;
            return;
        }

        ctx.body = format.toJSON();
    }
});

router.post('/save',
    jwtAuth({ admin: true }),
    async ctx => {
        const data = ctx.request.body.data;

        const format = await Format.findOne({ formatId: data.formatId });

        if (format != null) {
            await format.replaceOne(data);
        }

        ctx.status = 200;
    },
);

router.get('/timeline', async ctx => {
    if (ctx.query.id == null) {
        ctx.status = 404;
    }
});

// Sync format data
router.post('/sync',
    jwtAuth({ admin: true }),
    async ctx => {
        await syncChange();
        ctx.status = 200;
    },
);

// Get format change list
router.get('/change',
    jwtAuth({ admin: true }),
    async ctx => {
        const changes = ctx.query.id == null
            ? await FormatChange.find().sort({ date: -1 })
            : await FormatChange.find({ 'changes.format': ctx.query.id }).sort({ date: -1 });

        ctx.body = changes.map(r => r.toJSON());
    },
);

// Save format change
router.post('/change/save',
    jwtAuth({ admin: true }),
    async ctx => {
        const data = ctx.request.body.data;

        if (data._id == null) {
            await FormatChange.create(data);
        } else {
            await FormatChange.findByIdAndUpdate(data._id, data, { useFindAndModify: false });
        }

        ctx.status = 200;
    },
);

// Get external banlist, used in banlist checking
router.get('/banlist',
    jwtAuth({ admin: true }),
    async ctx => {
        ctx.body = {
            ...await getWizardsBanlist(),
        };
    },
);

// Get banlist change list or specific banlist change
router.get('/banlist/change',
    jwtAuth({ admin: true }),
    async ctx => {
        if (ctx.query.id == null) {
            const banlistChanges = await BanlistChange.find().sort({ date: -1 });

            ctx.body = banlistChanges.map(c => ({
                id:   c._id,
                date: c.date,
            }));
        } else {
            const id = ctx.query.id;

            const change = await BanlistChange.findById(id);

            if (change != null) {
                ctx.body = change.toObject({ versionKey: false });
            }
        }
    },
);

// Parse a banlist change from url
router.get('/banlist/change/parse',
    jwtAuth({ admin: true }),
    async ctx => {
        const url = ctx.query.url;

        ctx.body = await parseBanlist(url);
    },
);

// Save banlist change
router.post('/banlist/change/save',
    jwtAuth({ admin: true }),
    async ctx => {
        const data = ctx.request.body.data;

        if (data._id == null) {
            await BanlistChange.create(data);
        } else {
            await BanlistChange.findByIdAndUpdate(data._id, data, { useFindAndModify: false });
        }

        ctx.status = 200;
    },
);

export default router;
