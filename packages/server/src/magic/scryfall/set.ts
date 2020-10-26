
import Set, { ISet } from '../db/scryfall/set';

import { ProgressHandler } from '@/common/progress';

import { listOf } from './basic';
import { RawSet } from './interface';

export interface ISetStatus {
    method: 'get' | 'merge',
    type: 'set',
    total?: number,
    count: number
}

export class SetGetter extends ProgressHandler<ISetStatus> {
    async action(): Promise<void> {
        await Set.deleteMany({});

        let count = 0;

        for await (const sets of listOf<RawSet>('https://api.scryfall.com/sets')) {
            const setData = sets.map(s => ({
                set_id: s.id,
                ...s,
            } as ISet));

            await Set.insertMany(setData);

            count += setData.length;

            this.emitProgress({
                method: 'get',
                type:   'set',
                count,
            });
        }
    }

    abort(): void { /* no-op */ }
    equals(): boolean { return true; }
}

// export async function getSet() {

// }

// export async function syncScryfallSet(): Promise<void> {
//     const sets = await listOf('https://api.scryfall.com/sets');

//     for (const s of sets) {
//         const so = await Set.findOne({ 'scryfall.id': s.id }) ||
//             new Set({ setId: s.code, scryfall: { id: s.id } });

//         so.scryfall.code = s.code;
//         so.onlineCode = s.mtgo_code;
//         so.tcgplayerId = s.tcgplayer_id;
//         so.setType = s.set_type;
//         so.releaseDate = s.released_at;
//         so.block = s.block_code;
//         so.parent = s.parent_set_code;
//         so.cardCount = s.card_count;
//         so.isDigital = s.digital;
//         so.isFoilOnly = s.foil_only;

//         const enUS = so.localization.find(l => l.lang === 'enUS');

//         if (enUS != null) {
//             enUS.name = s.name;
//             enUS.block = s.block;
//         } else {
//             so.localization.push({
//                 lang:  'enUS',
//                 name:  s.name,
//                 block: s.block,
//             });
//         }

//         await so.save();
//     }
// }
