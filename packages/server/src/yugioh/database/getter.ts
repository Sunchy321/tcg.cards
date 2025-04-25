import Task from '@/common/task';

import axios from 'axios';
import cherrio from 'cheerio';

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

const baseUrl = `https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&sess=1&rp=100&request_locale=ja`;

export class DatabaseGetter extends Task<Status> {
    async startImpl(): Promise<void> {
        let total = 1;
        let count = 0;

        let start = Date.now();

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

        const totalPage = await this.getTotalPage();

        total = totalPage;
        count = 0;

        start = Date.now();

        // for (let i = 0; i < totalPage; i += 1) {

        // }
    }

    async getTotalPage(): Promise<number> {
        const html = await axios.get(baseUrl);
        const $ = cherrio.load(html.data);

        const lastButton = $('.yaji.max');

        const href = lastButton.attr('href');

        const m = /^javascript:ChangePage\((\d+)\)$/.exec(href ?? '');

        if (m != null) {
            return Number.parseInt(m[1], 10);
        } else {
            return 0;
        }
    }

    async stopImpl(): Promise<void> {
        // Implementation for stopping the database getter
    }
}
