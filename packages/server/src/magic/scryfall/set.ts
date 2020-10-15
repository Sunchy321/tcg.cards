import { SetModel } from '@/db/magic/model/set';

import { getList } from './basic';

export async function syncScryfallSet(): Promise<void> {
    const sets = await getList('https://api.scryfall.com/sets');

    for (const s of sets) {
        const so = await SetModel.findOne({ 'scryfall.id': s.id }) ||
            new SetModel({ setId: s.code, scryfall: { id: s.id } });

        so.scryfall.code = s.code;
        so.onlineCode = s.mtgo_code;
        so.tcgplayerId = s.tcgplayer_id;
        so.setType = s.set_type;
        so.releaseDate = s.released_at;
        so.block = s.block_code;
        so.parent = s.parent_set_code;
        so.cardCount = s.card_count;
        so.isDigital = s.digital;
        so.isFoilOnly = s.foil_only;

        const enUS = so.localization.find(l => l.lang === 'enUS');

        if (enUS != null) {
            enUS.name = s.name;
            enUS.block = s.block;
        } else {
            so.localization.push({
                lang:  'enUS',
                name:  s.name,
                block: s.block,
            });
        }

        await so.save();
    }
}
