import router from './router';

import { FormatModel } from '~/db/magic/model/format';

router.get('/raw-format', async ctx => {
    const id = ctx.query.id;

    const format = await FormatModel.findOne({ formatId: id });

    if (format != null) {
        ctx.body = format.toJSON();
    }
});

router.post('/create-format', async ctx => {
    const id = ctx.request.body.id;

    if ((await FormatModel.findOne({ formatId: id })) != null) {
        ctx.response.body = false;
    } else {
        new FormatModel({ formatId: id }).save();
        ctx.response.body = true;
    }
});

router.post('/update-format', async ctx => {
    const data = ctx.request.body.data;

    const format = await FormatModel.findById(data._id);

    if (format != null) {
        format.order = data.order;
        format.localization = data.localization;

        await format.save();
    }

    ctx.response.body = true;
});
