import { GameModule } from './interface';

import { createModule } from './game';

interface Data {
    locales: string[];
}

export type Module = GameModule<Data, unknown>;

export default createModule<Data, unknown>('hearthstone', { });
