import * as cheerio from 'cheerio';
import * as request from 'request-promise-native';

import { basicLang } from '../../../data/magic';

export interface ISetLocalization {
    lang: string;
    name: string;
    link: string;
}

const langMap: { [key: string]: string } = {
    enUS: 'en',
    deDE: 'de',
    esES: 'es',
    frFR: 'fr',
    itIT: 'it',
    ptBR: 'pt-br',
    jaJP: 'ja',
    ruRU: 'ru',
    koKR: 'ko',
    zhCN: 'zh-hans',
    zhTW: 'zh-hant',
};

export async function parseSet(url: string): Promise<ISetLocalization[]> {
    const result: ISetLocalization[] = [];

    for (const l of basicLang) {
        try {
            const link = url.replace('en', langMap[l]);
            const html = await request(link) as string;
            const $ = cheerio.load(html);

            const name = $($('title').get(0)).text().replace(/\|.*$/, '').trim();

            console.log(l, name);

            result.push({ lang: l, name, link });
        } catch (e) { console.log(l, e.toString().slice(0, 60)); }
    }

    return result;
}
