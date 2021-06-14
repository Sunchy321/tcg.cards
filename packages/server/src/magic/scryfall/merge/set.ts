import FileSaver from '@/common/save-file';
import Task from '@/common/task';
import { setIconPath } from '@/magic/image';

import ScryfallSet, { ISet as IScryfallSet } from '../../db/scryfall/set';
import Set, { ISet } from '../../db/set';

import { IStatus } from '../interface';

import { auxSetType } from '@/../data/magic/special';

async function mergeWith(data: IScryfallSet) {
    const set = await Set.findOne({ 'scryfall.id': data.set_id });

    if (set == null) {
        const object: ISet = {
            setId: data.code,

            block:  data.block_code,
            parent: data.parent_set_code,

            cardCount:   data.card_count,
            printedSize: data.printed_size,
            langs:       [],
            rarities:    [],

            localization: [{
                lang:           'en',
                name:           data.name,
                isOfficialName: true,
            }],

            setType:       data.set_type,
            isDigital:     data.digital,
            isFoilOnly:    data.foil_only,
            isNonfoilOnly: data.nonfoil_only,
            symbolStyle:   [],

            releaseDate: data.released_at,

            scryfall: {
                id:   data.set_id,
                code: data.code,
            },

            mtgoCode:    data.mtgo_code,
            tcgplayerId: data.tcgplayer_id,

        };

        await Set.create(object);
    } else {
        set.scryfall.id = data.set_id;
        set.scryfall.code = data.code;
        set.mtgoCode = data.mtgo_code;
        set.tcgplayerId = data.tcgplayer_id;
        set.setType = data.set_type;
        set.releaseDate = data.released_at;
        set.block = data.block_code;
        set.parent = data.parent_set_code;
        set.printedSize = data.printed_size;
        set.isDigital = data.digital;
        set.isFoilOnly = data.foil_only;
        set.isNonfoilOnly = data.nonfoil_only;

        await set.save();
    }
}

export class SetMerger extends Task<IStatus> {
    async startImpl(): Promise<void> {
        let count = 0;

        const total = await ScryfallSet.estimatedDocumentCount();

        const start = Date.now();

        for await (const set of await ScryfallSet.find()) {
            if (this.status === 'idle') {
                return;
            }

            await mergeWith(set);

            if (!auxSetType.includes(set.set_type)) {
                const saver = new FileSaver(
                    set.icon_svg_uri,
                    setIconPath(set.code, 'default', 'svg'),
                );

                await saver.start();
            }

            ++count;

            const elapsed = Date.now() - start;

            this.emit('progress', {
                method: 'merge',
                type:   'set',

                amount: { count, total },

                time: {
                    elapsed,
                    remaining: elapsed / count * (total - count),
                },
            });
        }
    }

    stopImpl(): void { /* no-op */ }
}
