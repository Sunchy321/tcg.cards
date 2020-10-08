import * as cheerio from 'cheerio';
import * as request from 'request-promise-native';

import { basicLang } from '../../../data/magic';

const langMap = {
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

export async function parseSet(url) {
    const result = [];

    for (const l of basicLang) {
        const link = url.replace('en', langMap[l]);
        const html = await request(link);
        const $ = cheerio.load(html);

        const name = $($('title').get(0)).text().replace(/\|.*$/, '').trim();

        result.push({ lang: l, name, link });
    }

    return result;
}
