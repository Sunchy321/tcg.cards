
import Set, { ISet } from '../db/scryfall/set';

import Task from '@/common/task';

import { listOf } from './basic';
import { IStatus, RawSet } from './interface';

export class SetGetter extends Task<IStatus> {
    async startImpl(): Promise<void> {
        await Set.deleteMany({});

        let count = 0;

        for await (const sets of listOf<RawSet>('https://api.scryfall.com/sets')) {
            const setData = sets.map(s => ({
                set_id: s.id,
                ...s,
            } as ISet));

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
