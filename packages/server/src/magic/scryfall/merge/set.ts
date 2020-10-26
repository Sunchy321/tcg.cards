import { ProgressHandler } from '@/common/progress';

import ScryfallSet from '../../db/scryfall/set';
import Set from '../../db/set';

import { ISetStatus } from '../set';

export class SetMerger extends ProgressHandler<ISetStatus> {
    async action(): Promise<void> {
        let count = 0;

        const total = await ScryfallSet.count({ });

        await ScryfallSet.find({}).cursor().eachAsync(async s => {
            await Set.mergeWith(s);

            ++count;

            this.emitProgress({
                method: 'merge',
                type:   'set',
                total,
                count,
            });
        });
    }

    abort(): void {
        // TODO
    }

    equals(): boolean { return true; }
}
