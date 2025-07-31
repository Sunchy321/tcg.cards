import { Hono } from 'hono';

import card from './card';
import set from './set';

const router = new Hono().basePath('/magic')
    .route('/', card)
    .route('/', set);

export default router;
