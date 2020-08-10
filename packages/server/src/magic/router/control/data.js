import router from './router';

import { loadCard, getCardProgress, loadRuling, getRulingProgress, cardList, rulingList } from '../../scryfall/bulk';

router.get('/scryfall/bulk-list', async (ctx) => {
    ctx.body = {
        cards:   cardList(),
        rulings: rulingList()
    };
});

router.post('/scryfall/load-card', async (ctx) => {
    loadCard(ctx.request.body.data);
});

router.get('/scryfall/card-progress', async (ctx) => {
    ctx.body = getCardProgress();
})

router.post('/scryfall/load-ruling', async (ctx) => {
    loadRuling(ctx.request.body.data);
});

router.get('/scryfall/ruling-progress', async (ctx) => {
    ctx.body = getRulingProgress();
})