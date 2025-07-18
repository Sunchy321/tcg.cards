import { join } from 'path';

import { dataPath } from '@/config';

export const localPath = join(dataPath, 'hearthstone', 'hsdata');

export const langMap: Record<string, string> = {
    deDE: 'de',
    enUS: 'en',
    esES: 'es',
    esMX: 'mx',
    frFR: 'fr',
    itIT: 'it',
    jaJP: 'ja',
    koKR: 'ko',
    plPL: 'pl',
    ptBR: 'pt',
    ruRU: 'ru',
    thTH: 'th',
    zhCN: 'zhs',
    zhTW: 'zht',
};
