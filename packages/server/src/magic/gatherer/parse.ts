/* eslint-disable no-use-before-define */
import cheerio from 'cheerio';
import request from 'request-promise-native';

import Card from '@/magic/db/card';

import FileSaver from '@/common/save-file';

import { cardImagePath } from '../image';

const imgAltMap: Record<string, string> = {
    'White':              'W',
    'Blue':               'U',
    'Black':              'B',
    'Red':                'R',
    'Green':              'G',
    'Colorless':          'C',
    'Tap':                'T',
    'Variable Colorless': 'X',
};

function getText($: cheerio.Root, elem: cheerio.Cheerio) {
    let result = '';

    for (const e of elem.contents()) {
        if (e.type === 'text') {
            result += e.data;
        } else if (e.type === 'tag' && e.name === 'div') {
            result += `${getText($, $(e))}\n`;
        } else if (e.type === 'tag' && e.name === 'img') {
            result += `{${imgAltMap[e.attribs.alt] ?? e.attribs.alt}}`;
        } else {
            result += $(e).text();
        }
    }

    return result.replace(/\n( *\n)*/g, '\n').trim();
}

type ParsedGatherer = {
    number: string;
    parts: {
        name: string;
        typeline: string;
        text: string;
        flavorText: string;
    }[];
};

async function parseGathererDetail(mids: number[]): Promise<ParsedGatherer> {
    const html = await request(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${mids[0]}&printed=true`);
    const $ = cheerio.load(html);

    if ($('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_nameRow').length === 0) {
        // TODO
        return { number: '', parts: [] };
    } else {
        const firstNumber = getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_numberRow > .value'));

        const number = firstNumber.endsWith('a') ? firstNumber.slice(0, -1) : firstNumber;

        const firstName = getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_nameRow > .value'));
        const secondName = getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_nameRow > .value'));

        return {
            number,
            parts: [
                {
                    name:       firstName.includes('//') ? firstName.split('//')[0].trim() : firstName,
                    typeline:   getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_typeRow > .value')),
                    text:       getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_textRow > .value')),
                    flavorText: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_flavorRow > .value')),
                },
                {
                    name:       secondName.includes('//') ? secondName.split('//')[1].trim() : secondName,
                    typeline:   getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_typeRow > .value')),
                    text:       getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_textRow > .value')),
                    flavorText: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl02_flavorRow > .value')),
                },
            ],
        };
    }
}

async function saveGathererImage(mids: number[], set: string, number: string, lang: string) {
    if (mids.length === 1) {
        const saver = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number),
        );

        saver.start();

        await saver.waitForEnd();
    } else {
        const saverFront = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number, 0),
        );

        const saverBack = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[1]}&type=card`,
            cardImagePath('large', set, lang, number, 1),
        );

        saverFront.start();
        saverBack.start();

        await Promise.all([saverFront.waitForEnd(), saverBack.waitForEnd()]);
    }
}

const languageMap: Record<string, string> = {
    'Chinese Traditional': 'zht',
    'German':              'de',
    'French':              'fr',
    'Italian':             'it',
    'Japanese':            'ja',
    'Korean':              'ko',
    'Portuguese (Brazil)': 'pt',
    'Russian':             'ru',
    'Chinese Simplified':  'zhs',
    'Spanish':             'es',
};

async function parseVersionDetail($: cheerio.Root) {
    const lines = $('.cardItem').get();

    return lines.map(l => {
        const tds = $(l).children('td').get();

        const a = $(tds[0]).children()[0];

        const href = $(a).attr('href');

        const m = href != null ? /^Details\.aspx\?multiverseid=(\d+)$/.exec(href) : undefined;

        return {
            name: $(tds[0]).text().trim(),
            lang: languageMap[$(tds[1]).text().trim()],
            id:   m != null ? Number.parseInt(m[1], 10) : undefined,
        };
    });
}

async function parseVersion(mid: number) {
    const html = await request(`https://gatherer.wizards.com/Pages/Card/Languages.aspx?multiverseid=${mid}`);
    const $ = cheerio.load(html);

    const versions = await parseVersionDetail($);

    if ($('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_languageList_pagingControls').length > 0) {
        const links = $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_languageList_pagingControls > a').get().slice(1, -1);

        for (const a of links) {
            const aHtml = await request(`https://gatherer.wizards.com${$(a).attr('href')!}`);
            const a$ = cheerio.load(aHtml);

            versions.push(...await parseVersionDetail(a$));
        }
    }

    return versions;
}

export default async function parseGatherer(
    mids: number[],
    set: string,
    number: string,
    lang: string,
): Promise<void> {
    await saveGathererImage(mids, set, number, lang);

    const baseCard = await Card.findOne({ set, number, lang });

    if (baseCard == null) {
        return;
    }

    const versions = await parseVersion(mids[0]);

    for (const v of versions) {
        if (v.id == null) {
            continue;
        }

        const vMids = mids.map((_, index) => v.id! + index);
        const data = await parseGathererDetail(vMids);

        await saveGathererImage(vMids, set, data.number, v.lang);

        const oldCard = await Card.findOne({ set, number: data.number, lang: v.lang });

        if (oldCard != null) {
            continue;
        }

        const newData = baseCard.toObject();

        delete newData._id;
        delete newData.__v;

        newData.number = data.number;
        newData.lang = v.lang;

        for (const [i, p] of newData.parts.entries()) {
            const dPart = data.parts[i];

            delete p.scryfallIllusId;

            p.unified.name = dPart.name;
            p.unified.typeline = dPart.typeline;
            p.unified.text = dPart.text;

            p.printed.name = dPart.name;
            p.printed.typeline = dPart.typeline;
            p.printed.text = dPart.text;

            if (dPart.flavorText !== '') {
                p.flavorText = dPart.flavorText;
            } else {
                delete p.flavorText;
            }
        }

        delete newData.scryfall.cardId;
        newData.scryfall.imageUris = [];
        delete newData.arenaId;
        delete newData.mtgoId;
        delete newData.mtgoFoilId;
        newData.multiverseId = vMids;
        delete newData.tcgPlayerId;
        delete newData.cardMarketId;

        new Card(newData).save();
    }
}
