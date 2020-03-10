import router from './router';
import { getBulkData as getScryfallBulk } from '../../scryfall/get-bulk-data';

router.post('/get-scryfall-bulk', async (ctx) => {
    await getScryfallBulk();

    ctx.response.status = 200;
});