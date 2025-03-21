import KoaRouter from '@koa/router';

import blizzard from './blizzard';
import card from './card';
import entity from './entity';
import search from './search';
import format from './format';
import patch from './patch';
import set from './set';
import logParse from './log-parse';

const router = new KoaRouter();

router.prefix('/hearthstone');

router.use(blizzard.routes());
router.use(card.routes());
router.use(entity.routes());
router.use(search.routes());
router.use(format.routes());
router.use(patch.routes());
router.use(set.routes());
router.use(logParse.routes());

export default router;
