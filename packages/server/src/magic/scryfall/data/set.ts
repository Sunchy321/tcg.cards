import FileSaver from '@/common/save-file';
import Task from '@/common/task';
import { setIconPath } from '@/magic/image';

import Set from '@/magic/db/set';

import { Set as ISet } from '@interface/magic/set';
import { RawSet } from '@interface/magic/scryfall/set';

import { Status } from '../status';

import { listOf } from '../basic';

import { auxSetType } from '@/../data/magic/special';

async function mergeWith(data: RawSet) {
    const set = await Set.findOne({ 'scryfall.id': data.id });

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
                id:   data.id,
                code: data.code,
            },

            mtgoCode:    data.mtgo_code,
            tcgplayerId: data.tcgplayer_id,

        };

        await Set.create(object);
    } else {
        set.scryfall.id = data.id;
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

export default class SetGette extends Task<Status> {
    async startImpl(): Promise<void> {
        let count = 0;
        let total = 0;

        // start timer
        const start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'get',
                type:   'set',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        for await (const sets of listOf<RawSet>('https://api.scryfall.com/sets')) {
            total += sets.length;

            for (const set of sets) {
                await mergeWith(set);

                if (!auxSetType.includes(set.set_type)) {
                    const saver = new FileSaver(
                        set.icon_svg_uri,
                        setIconPath(set.code, 'default', 'svg'),
                    );

                    await saver.start();
                }

                count += 1;
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}
