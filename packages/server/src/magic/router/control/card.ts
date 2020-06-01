import router from './router';
import { get, load } from '../../scryfall/bulk';

router.post('/get-scryfall-bulk', async (ctx) => {
    await get();

    ctx.response.status = 200;
});

router.post('/load-scryfal-bulk', async (ctx) => {
    await load();

    ctx.response.status = 200;
})