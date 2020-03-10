import saveFile from '../../common/save-file';
import { getList } from './basic';

import { data } from '../../../config';

export interface IScryfallBulkData {
    object: 'bulk_data';
    id: string;
    type: string;
    name: string;
    description: string;
    permalink_uri: string;
    updated_at: string;
    compressed_size: number;
    content_type: string;
    content_encoding: string;
}

export async function getBulkData() {
    const bulks = await getList<IScryfallBulkData>('https://api.scryfall.com/bulk-data');

    for (const b of bulks) {
        if (b.type === 'all_cards') {
            saveFile(
                b.permalink_uri,
                data + '/magic/bulk/scryfall/cards.json',
                { override: true },
            );
        } else if (b.type === 'rulings') {
            saveFile(
                b.permalink_uri,
                data + '/magic/bulk/scryfall/rulings.json',
                { override: true },
            );
        }
    }
}


