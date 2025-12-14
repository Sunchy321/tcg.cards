import FileSaver from '@/common/save-file';
import Task from '@/common/task';
import { setIconPath } from '@/magic/image';

import { db } from '@/drizzle';
import { Set as SetTable } from '../../schema/set';

import { RawSet } from '@interface/magic/scryfall/set';

import { Status } from './status';

import { eq, or } from 'drizzle-orm';
import { listOf } from './common';

import { auxSetType } from '@static/magic/special';

async function mergeWith(data: RawSet) {
    await db.transaction(async tx => {
        const existing = await tx.select()
            .from(SetTable)
            .where(or(eq(SetTable.scryfallId, data.id), eq(SetTable.setId, data.code)))
            .then(rows => rows[0]);

        if (existing == null) {
            await tx.insert(SetTable).values({
                setId: data.code,

                block:  data.block_code ?? null,
                parent: data.parent_set_code ?? null,

                cardCount:   data.card_count ?? 0,
                printedSize: data.printed_size ?? null,
                langs:       [],
                rarities:    [],

                type:            data.set_type,
                isDigital:       data.digital,
                isFoilOnly:      data.foil_only,
                isNonfoilOnly:   data.nonfoil_only,
                symbolStyle:     [],
                doubleFacedIcon: null,

                releaseDate: data.released_at ?? null,

                scryfallId:   data.id,
                scryfallCode: data.code,

                mtgoCode:    data.mtgo_code ?? null,
                tcgPlayerId: data.tcgplayer_id ?? null,
            });
        } else {
            await tx.update(SetTable).set({
                scryfallId:    data.id,
                scryfallCode:  data.code,
                mtgoCode:      data.mtgo_code ?? null,
                tcgPlayerId:   data.tcgplayer_id ?? null,
                type:          data.set_type,
                releaseDate:   data.released_at ?? null,
                block:         data.block_code ?? null,
                parent:        data.parent_set_code ?? null,
                printedSize:   data.printed_size ?? null,
                isDigital:     data.digital,
                isFoilOnly:    data.foil_only,
                isNonfoilOnly: data.nonfoil_only,
            }).where(eq(SetTable.setId, existing.setId));
        }
    });
}

export class SetGetter extends Task<Status> {
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
