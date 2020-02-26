import router from './router';
import { getBulkData } from '../../scryfall/get-bulk-data';

router.post('/get-scryfall-card-bulk', async (ctx) => {
    await getBulkData();

    ctx.response.status = 200;
});
