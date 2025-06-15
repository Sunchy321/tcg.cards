import Task from '@/common/task';

import Print from '@/magic/db/print';

import FileSaver from '@/common/save-file';

import { cardImagePath } from '@/magic/image';

type Status = {
    method: string;
    type:   string;

    amount: {
        updated?: number;
        count:    number;
        total?:   number;
    };

    time?: {
        elapsed:   number;
        remaining: number;
    };
};

export async function saveGathererImage(mids: number[], set: string, number: string, lang: string): Promise<void> {
    if (mids.length === 1) {
        const saver = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number),
        );

        saver.start();

        await saver.waitForEnd();
    } else {
        const saverFront = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number, 0),
        );

        const saverBack = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[1]}&type=card`,
            cardImagePath('large', set, lang, number, 1),
        );

        saverFront.start();
        saverBack.start();

        await Promise.all([saverFront.waitForEnd(), saverBack.waitForEnd()]);
    }
}

export class GathererImageTask extends Task<Status> {
    set: string;

    constructor(set: string) {
        super();
        this.set = set;
    }

    protected async startImpl() {
        const prints = await Print.find({ 'set': this.set, 'multiverseId.0': { $exists: true } });

        let count = 0;
        const total = prints.length;

        const start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type:   'card',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        for (const p of prints) {
            await saveGathererImage(p.multiverseId, p.set, p.number, p.lang);

            count += 1;
        }
    }

    protected stopImpl(): void {

    }
}
