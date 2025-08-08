import { join } from 'path';

import { dataPath } from '@/config';

import { Locale } from '@model/hearthstone/schema/basic';
import { XLocStringTag, XTag } from '@model/hearthstone/schema/data/hsdata';
import { ITag } from './task';

export const localPath = join(dataPath, 'hearthstone', 'hsdata');

export const langMap: Record<string, Locale> = {
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

export interface HsdataParser {
    buildNumber: number;

    getMapData<T>(name: string): Record<string, T>;
    getSpecialData<T>(name: string): T;
    getValue(tag: XLocStringTag | XTag, info: ITag, cardIdMap: Record<number, string>): any;
}
