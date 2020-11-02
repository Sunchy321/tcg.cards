import { ProgressHandler } from '@/common/progress';

import ScryfallSet, { ISet as IScryfallSet } from '../../db/scryfall/set';
import Set, { ISet } from '../../db/set';

import { ISetStatus } from '../set';

async function mergeWith(data: IScryfallSet) {
    const set = await Set.findOne({ 'scryfall.id': data.set_id });

    if (set == null) {
        const object: ISet = {
            setId: data.code,

            scryfall: {
                id:   data.set_id,
                code: data.code,
            },

            mtgoCode:    data.mtgo_code,
            tcgplayerId: data.tcgplayer_id,

            block:  data.block_code,
            parent: data.parent_set_code,

            localizations: [{
                lang:  'en',
                name:  data.name,
                block: data.block,
            }],

            setType:       data.set_type,
            isDigital:     data.digital,
            isFoilOnly:    data.foil_only,
            isNonfoilOnly: data.nonfoil_only,

            releaseDate: data.released_at,

            cardCount:   data.card_count,
            printedSize: data.printed_size,
        };

        return this.create(object);
    } else {
        set.scryfall.id = data.set_id;
        set.scryfall.code = data.code;
        set.mtgoCode = data.mtgo_code;
        set.tcgplayerId = data.tcgplayer_id;
        set.setType = data.set_type;
        set.releaseDate = data.released_at;
        set.block = data.block_code;
        set.parent = data.parent_set_code;
        set.cardCount = data.card_count;
        set.printedSize = data.printed_size;
        set.isDigital = data.digital;
        set.isFoilOnly = data.foil_only;
        set.isNonfoilOnly = data.nonfoil_only;

        for (const l of set.localizations) {
            if (l.lang === 'en') {
                l.name = data.name;
            }
        }

        await set.save();
    }
}

export class SetMerger extends ProgressHandler<ISetStatus> {
    async action(): Promise<void> {
        let count = 0;

        const total = await ScryfallSet.count({ });

        await ScryfallSet.find({}).cursor().eachAsync(async s => {
            await mergeWith(s);

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
