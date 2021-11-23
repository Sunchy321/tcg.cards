import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Format from '@/magic/db/format';
import FormatChange from '@/magic/db/format-change';
import BanlistChange from '@/magic/db/banlist-change';

import websocket from '@/middlewares/websocket';
import { syncChange } from '@/magic/change';
import parseBanlist from '@/magic/banlist/parse';
import { getWizardsBanlist } from '@/magic/banlist/get';
import { toSingle } from '@/common/request-helper';
import { LegalityAssigner } from '@/magic/banlist/legality';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/format');

router.post('/save', async ctx => {
    const { data } = ctx.request.body;

    const format = await Format.findOne({ formatId: data.formatId });

    if (format != null) {
        await format.replaceOne(data);
    }

    ctx.status = 200;
});

// Sync format data
router.post('/sync', async ctx => {
    await syncChange();
    ctx.status = 200;
});

// Get format change list
router.get('/change', async ctx => {
    const changes = ctx.query.id == null
        ? await FormatChange.find().sort({ date: -1 })
        : await FormatChange.find({ 'changes.format': ctx.query.id }).sort({ date: -1 });

    ctx.body = changes.map(r => r.toJSON());
});

// Save format change
router.post('/change/save', async ctx => {
    const { data } = ctx.request.body;

    if (data._id == null) {
        await FormatChange.create(data);
    } else {
        await FormatChange.findByIdAndUpdate(data._id, data, { useFindAndModify: false });
    }

    ctx.status = 200;
});

// Get external banlist, used in banlist checking
router.get('/banlist', async ctx => {
    ctx.body = {
        ...await getWizardsBanlist(),
    };
});

// Get banlist change list or specific banlist change
router.get('/banlist/change', async ctx => {
    if (ctx.query.id == null) {
        const banlistChanges = await BanlistChange.find().sort({ date: -1 });

        ctx.body = banlistChanges.map(c => ({
            id:   c._id,
            date: c.date,
        }));
    } else {
        const { id } = ctx.query;

        const change = await BanlistChange.findById(id);

        if (change != null) {
            ctx.body = change.toObject({ versionKey: false });
        }
    }
});

// Parse a banlist change from url
router.get('/banlist/change/parse', async ctx => {
    if (ctx.query.url == null) {
        ctx.status = 400;
        return;
    }

    const url = toSingle(ctx.query.url);

    ctx.body = await parseBanlist(url);
});

// Save banlist change
router.post('/banlist/change/save', async ctx => {
    const { data } = ctx.request.body;

    if (data._id == null) {
        await BanlistChange.create(data);
    } else {
        await BanlistChange.findByIdAndUpdate(data._id, data, { useFindAndModify: false });
    }

    ctx.status = 200;
});

const assigner = new LegalityAssigner();

// Assign card legality
router.get(
    '/assign-legality',
    websocket,
    async ctx => {
        assigner.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
