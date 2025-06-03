import KoaRouter from '@koa/router';

// import card from './card';
// import search from './search';

const router = new KoaRouter();

router.prefix('/integrated');

// router.use(card.routes());
// router.use(search.routes());

export default router;
