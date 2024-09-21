import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import CR from '@/magic/db/cr';
import { CR as ICR, Content, Glossary } from '@interface/magic/cr';

import { isEqual, mapValues, zip } from 'lodash';
import { diffThreeString } from '@common/util/diff';
import { toSingle } from '@/common/request-helper';
import { diff } from '@/magic/cr/diff';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/cr');

router.get('/', async ctx => {
    const { date } = mapValues(ctx.query, toSingle);

    if (date != null) {
        const menu = await CR.findOne({ date });

        if (menu != null) {
            ctx.body = menu.toJSON();
        }

        return;
    }

    const crs = await CR.find().distinct('date') as string[];

    ctx.body = crs.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
});

router.get('/diff', async ctx => {
    const { from, to } = mapValues(ctx.query, toSingle);

    if (from == null || to == null) {
        return;
    }

    ctx.body = await diff(from, to);
});

router.get('/history', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id.startsWith('g:')) {
        const ids = id.slice(2).split(',');

        const data: (Omit<Glossary, 'ids'> & { versions: string[] })[] = [];

        const crs = await CR.find({ 'glossary.ids': { $in: ids } }) as ICR[];

        for (const cr of crs) {
            const g = cr.glossary.find(g => g.ids.some(i => ids.includes(i)));

            if (g != null) {
                const r = data.find(r => g.text === r.text);

                if (r != null) {
                    r.versions.push(cr.date);
                } else {
                    data.push({
                        words:    g.words,
                        text:     g.text,
                        versions: [cr.date],
                    });
                }
            }
        }

        for (const r of data) {
            r.versions = r.versions.sort();
        }

        data.sort((a, b) => (a.versions[0] < b.versions[0] ? -1 : a.versions[0] > b.versions[0] ? 1 : 0));

        const result = data.map((curr, i, arr) => {
            const prev = arr[i - 1];
            const next = arr[i + 1];

            return {
                ...curr,

                diff: diffThreeString(prev?.text ?? curr.text, curr.text, next?.text ?? curr.text),
            };
        });

        ctx.body = { type: 'glossary', id, result };
    } else {
        const crs = await CR.find({ 'contents.id': id }) as ICR[];

        const data: (Omit<Content, 'depth' | 'id'> & { versions: string[] })[] = [];

        for (const cr of crs) {
            const c = cr.contents.find(c => c.id === id);

            if (c != null) {
                const r = data.find(r => c.text === r.text && isEqual(r.examples, c.examples));

                if (r != null) {
                    r.versions.push(cr.date);
                } else {
                    data.push({
                        index:    c.index,
                        text:     c.text,
                        examples: c.examples,
                        versions: [cr.date],
                    });
                }
            }
        }

        for (const r of data) {
            r.versions = r.versions.sort();
        }

        data.sort((a, b) => (a.versions[0] < b.versions[0] ? -1 : a.versions[0] > b.versions[0] ? 1 : 0));

        const result = data.map((curr, i, arr) => {
            const prev = arr[i - 1];
            const next = arr[i + 1];

            const examplesDiff = zip(
                prev?.examples ?? curr.examples ?? [],
                curr.examples ?? [],
                next?.examples ?? curr.examples ?? [],
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-shadow
                ([prev, curr, next]) => diffThreeString(prev ?? curr ?? '', curr ?? '', next ?? curr ?? ''),
            ).filter(v => v.length > 0);

            return {
                ...curr,

                diff: diffThreeString(prev?.text ?? curr.text, curr.text, next?.text ?? curr.text),

                ...examplesDiff.length > 0 ? { examplesDiff } : ({}),
            };
        });

        ctx.body = { type: 'content', id, result };
    }
});

export default router;
