import Set, { ISet as IScryfallSet } from '../db/scryfall/set';

import Task from '@/common/task';

import { RawSet } from '@interface/magic/scryfall/set';
import { Status } from './status';

import { listOf } from './basic';

export class SetGetter extends Task<Status> {
    async startImpl(): Promise<void> {
        await Set.deleteMany({});

        let count = 0;

        for await (const sets of listOf<RawSet>('https://api.scryfall.com/sets')) {
            const setData = sets.map(s => ({
                set_id: s.id,
                ...s,
            } as IScryfallSet));

            await Set.insertMany(setData);

            count += setData.length;

            this.emit('progress', {
                method: 'get',
                type:   'set',

                amount: { count },
            });
        }
    }

    stopImpl(): void { /* no-op */ }
}
