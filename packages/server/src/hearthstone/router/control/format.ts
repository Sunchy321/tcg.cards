import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Format from '@/hearthstone/db/format';
import FormatAnnouncement from '@/hearthstone/db/format-announcement';

import { AnnouncementApplier } from '@/hearthstone/banlist/apply';
// import { LegalityAssigner } from '@/magic/banlist/legality';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

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

router.get('/announcement', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        const announcements = await FormatAnnouncement.find().sort({ date: -1 });

        ctx.body = announcements.map(c => ({
            id:     c._id,
            source: c.source,
            date:   c.date,
            name:   c.name,
        }));
    } else {
        const announcement = await FormatAnnouncement.findById(id);

        if (announcement == null) {
            ctx.status = 401;
            return;
        }

        ctx.body = announcement.toObject();
    }
});

router.post('/announcement/save', async ctx => {
    const { data } = ctx.request.body;

    if (data._id == null) {
        await FormatAnnouncement.create(data);
    } else {
        await FormatAnnouncement.findByIdAndUpdate(data._id, data, { useFindAndModify: false });
    }

    ctx.status = 200;
});

const applier = new AnnouncementApplier();

router.post('/announcement/apply', async ctx => {
    await applier.apply();

    ctx.status = 200;
});

// const assigner = new LegalityAssigner();

// // Assign card legality
// router.get('/assign-legality', websocket, async ctx => {
//     assigner.bind(await ctx.ws());
//     ctx.status = 200;
// });

export default router;
