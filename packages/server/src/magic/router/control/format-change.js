import router from './router';

import { FormatChangeModel } from '../../db/model/format-change';
import { parseBanlist } from '../../parse-banlist';

router.get('/parse-banlist', async ctx => {
    ctx.body = await parseBanlist(ctx.query.url);
});

router.get('/raw-format-change', async ctx => {
    const result = [];

    const filter = ctx.query.filter;

    if (filter != null) {
        await FormatChangeModel.find({ source: filter }).sort({ date: -1 }).cursor().eachAsync(async c => {
            result.push(c.toJSON());
        });
    } else {
        await FormatChangeModel.find().sort({ date: -1 }).cursor().eachAsync(async c => {
            result.push(c.toJSON());
        });
    }

    ctx.body = result;
});

router.post('/update-format-change', async ctx => {
    const data = ctx.request.body.data;

    if (data._id === '' || data._id == null) {
        delete data._id;

        await new FormatChangeModel(data).save();
    } else {
        const doc = await FormatChangeModel.findById(data._id);

        for (const key in data) {
            if (key !== '_id' && !key.startsWith('__')) {
                doc.set(key, data[key]);
            }
        }

        await doc.save();
    }

    ctx.response.body = true;
});


export default router;
