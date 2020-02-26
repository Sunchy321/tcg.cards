import router from './router';

import { syncScryfallSet } from '../../scryfall/set';
import { SetModel } from '../../db/model/set';
import { parseSet } from '../../parse-set';

router.get('/raw-set', async (ctx) => {
    const id = ctx.query.id;

    const set = await SetModel.findOne({ setId: id });

    if (set != null) {
        ctx.body = set.toJSON();
    }
});

router.post('/sync-scryfall-set', async (ctx: any) => {
    await syncScryfallSet();

    ctx.response.status = 200;
});

router.post('/sync-mtgjson-set', async (ctx: any) => {
    // await syncScryfallSet();

    ctx.response.status = 200;
});

router.post('/update-set', async (ctx: any) => {
    const data = ctx.request.body.data as { [k: string]: any };

    if (data._id === '' || data._id == null) {
        delete data._id;

        await new SetModel(data).save();
    } else {
        const doc = (await SetModel.findById(data._id))!;

        for (const key in data) {
            if (key !== '_id' && !key.startsWith('__')) {
                doc.set(key, data[key]!);
            }
        }

        await doc.save();
    }

    ctx.response.body = true;
});

router.get('/parse-set', async (ctx) => {
    ctx.body = await parseSet(ctx.query.url);
});
