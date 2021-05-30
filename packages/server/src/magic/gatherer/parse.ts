import cheerio from 'cheerio';
import request from 'request-promise-native';

import { ICard } from '../db/card';

import FileSaver from '@/common/save-file';

import { cardImagePath } from '../image';

type PartialCard = Omit<Partial<ICard>, 'parts'> & {
    parts?: ICard['parts'] extends (infer P)[] ? Partial<P>[] : never;
}

export default async function parseGatherer(
    mids: string[],
    set: string, number: string, lang: string,
): Promise<PartialCard> {
    await saveGathererImage(mids, set, number, lang);
    return parseGathererDetail(mids);
}

const imgAltMap: Record<string, string> = {
    White: 'W',
    Blue:  'U',
    Black: 'B',
    Red:   'R',
    Green: 'G',
    Tap:   'T',
};

function getText($: cheerio.Root, elem: cheerio.Cheerio) {
    let result = '';

    const contents = elem.contents();

    for (let i = 0; i < contents.length; ++i) {
        const e = contents[i];

        if (e.type === 'text') {
            result += e.data;
        } else if (e.type === 'tag' && e.name === 'div') {
            result += getText($, $(e)) + '\n';
        } else if (e.type === 'tag' && e.name === 'img') {
            result += `{${imgAltMap[e.attribs.alt] ?? e.attribs.alt}}`;
        } else {
            result += $(e).text();
        }
    }

    return result.trim();
}

async function parseGathererDetail(mids: string[]): Promise<PartialCard> {
    const result: PartialCard = {};

    const html = await request(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${mids[0]}&printed=true`);
    const $ = cheerio.load(html);

    if (mids.length === 1) {
        // TODO
    } else {
        result.parts = [
            {
                printed: {
                    name:     getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_nameRow > .value')),
                    typeline: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_typeRow > .value')),
                    text:     getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_textRow > .value')),
                },

                flavorText: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_flavorRow > .value')),
            },
            {
                printed: {
                    name:     getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_nameRow > .value')),
                    typeline: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_typeRow > .value')),
                    text:     getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_textRow > .value')),
                },

                flavorText: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_flavorRow > .value')),
            },
        ];
    }

    return result;
}

async function saveGathererImage(mids: string[], set: string, number: string, lang: string) {
    if (mids.length === 1) {
        const saver = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath(
                'large',
                set,
                lang,
                number,
            ),
        );

        saver.start();

        await saver.waitForEnd();
    } else {
        const saverFront = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath(
                'large',
                set,
                lang,
                number,
                0,
            ),
        );

        const saverBack = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[1]}&type=card`,
            cardImagePath(
                'large',
                set,
                lang,
                number,
                1,
            ),
        );

        saverFront.start();
        saverBack.start();

        await Promise.all([saverFront.waitForEnd(), saverBack.waitForEnd()]);
    }
}
