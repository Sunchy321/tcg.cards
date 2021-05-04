import { GameModule } from './interface';

import { createModule } from './game';

interface Data {
    locales: string[];
}

export type Module = GameModule<Data, { }>;

export default createModule<Data, { }>('hearthstone', { });
