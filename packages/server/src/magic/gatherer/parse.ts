import cheerio from 'cheerio';
import axios from 'axios';

import Task from '@/common/task';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';

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
    'Green or Blue':      'G/U',
    'Green or White':     'G/W',
    'White or Blue':      'W/U',
    'White or Black':     'W/B',
    'Blue or Black':      'U/B',
    'Blue or Red':        'U/R',
    'Black or Red':       'B/R',
    'Black or Green':     'B/G',
    'Red or Green':       'R/G',
    'Red or White':       'R/W',
    'Snow':               'S',
    'Phyrexian White':    'W/P',
    'Phyrexian Blue':     'U/P',
    'Phyrexian Black':    'B/P',
    'Phyrexian Red':      'R/P',
    'Phyrexian Green':    'G/P',
    'Energy':             'E',
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
            result += getText($, $(e));
        }
    }

    return result.replace(/\n( *\n)*/g, '\n').trim();
}

type ParsedGatherer = {
    number: string;
    parts: {
        name:       string;
        typeline:   string;
        text:       string;
        flavorText: string;
    }[];
};

async function parseGathererDetail(mids: number[]): Promise<ParsedGatherer> {
    const { data:html } = await axios.get(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${mids[0]}&printed=true`);
    const $ = cheerio.load(html);

    if ($('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_ctl01_nameRow').length === 0) {
        return {
            number: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_CardNumberValue')),
            parts:  [
                {
                    name:       getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_nameRow > .value')),
                    typeline:   getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_typeRow > .value')),
                    text:       getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_textRow > .value')),
                    flavorText: getText($, $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_flavorRow > .value')),
                },
            ],
        };
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

export async function saveGathererImage(mids: number[], set: string, number: string, lang: string): Promise<void> {
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
    'Chinese Simplified':  'zhs',
    'Chinese Traditional': 'zht',
    'English':             'en',
    'French':              'fr',
    'German':              'de',
    'Italian':             'it',
    'Japanese':            'ja',
    'Korean':              'ko',
    'Portuguese (Brazil)': 'pt',
    'Russian':             'ru',
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
    const { data:html } = await axios.get(`https://gatherer.wizards.com/Pages/Card/Languages.aspx?multiverseid=${mid}`);
    const $ = cheerio.load(html);

    const versions = await parseVersionDetail($);

    if ($('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_languageList_pagingControls').length > 0) {
        const links = $('#ctl00_ctl00_ctl00_MainContent_SubContent_SubContent_languageList_pagingControls > a').get().slice(1, -1);

        for (const a of links) {
            const { data: aHtml } = await axios.get(`https://gatherer.wizards.com${$(a).attr('href')!}`);
            const a$ = cheerio.load(aHtml);

            versions.push(...await parseVersionDetail(a$));
        }
    }

    return versions;
}

interface GathererStatus {
    method: string;
    type:   string;

    amount: {
        updated?: number;
        count:    number;
        total?:   number;
    };

    time?: {
        elapsed:   number;
        remaining: number;
    };

    status: Record<string, [number, number] | null>;
}

export class GathererGetter extends Task<GathererStatus> {
    set: string;

    statusMap: Record<string, [number, number] | null> = {};

    constructor(set: string) {
        super();

        this.set = set;
    }

    async startImpl(): Promise<void> {
        const prints = await Print.find({ 'set': this.set, 'multiverseId.0': { $exists: true } });

        const cardList: {
            cardId:   string;
            versions: {
                lang:   string;
                number: string;
                mids:   number[];
            }[];
        } [] = [];

        for (const p of prints) {
            const item = cardList.find(v => v.cardId === p.cardId);

            if (item != null) {
                item.versions.push({
                    lang:   p.lang,
                    number: p.number,
                    mids:   p.multiverseId,
                });
            } else {
                cardList.push({
                    cardId:   p.cardId,
                    versions: [{
                        lang:   p.lang,
                        number: p.number,
                        mids:   p.multiverseId,
                    }],
                });
            }
        }

        const total = cardList.length;
        let count = 0;

        this.statusMap = Object.fromEntries(cardList.map(c => {
            const version = c.versions.find(v => v.lang === 'en') ?? c.versions[0];

            return [version.number, null];
        }));

        // start timer
        const start = Date.now();

        this.intervalProgress(500, () => {
            const prog: GathererStatus = {
                method: 'load',
                type:   'card',

                amount: { total, count },
                status: this.statusMap,
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        for (const [i, c] of cardList.entries()) {
            console.log(`${c.cardId}, ${i}/${cardList.length}`);

            const version = c.versions.find(v => v.lang === 'en') ?? c.versions[0];

            await this.parseGatherer(version.mids, this.set, version.number, version.lang);

            count += 1;
        }
    }

    async parseGatherer(
        mids: number[],
        set: string,
        number: string,
        lang: string,
    ): Promise<void> {
        await saveGathererImage(mids, set, number, lang);

        const basePrint = await Print.findOne({ set, number, lang });

        if (basePrint == null) {
            return;
        }

        const baseCard = await Card.findOne({ cardId: basePrint.cardId });

        if (baseCard == null) {
            return;
        }

        const versions = await parseVersion(mids[0]);

        const prints = await Print.find({ multiverseId: { $in: versions.map(v => v.id).filter(v => v != null) } });

        const versionsToParse = [];

        for (const v of versions) {
            if (v.id != null && prints.every(c => !c.multiverseId.includes(v.id!))) {
                versionsToParse.push(v);
            }
        }

        this.statusMap[number] = [versions.length - versionsToParse.length, versions.length];

        for (const [i, v] of versionsToParse.entries()) {
            const vMids = mids.map((_, index) => v.id! + index);
            try {
                const data = await parseGathererDetail(vMids);

                await saveGathererImage(vMids, set, data.number, v.lang);

                for (const [i, p] of baseCard.parts.entries()) {
                    const loc = p.localization.find(l => l.lang === lang);

                    if (loc == null) {
                        p.localization.push({
                            lang,
                            name:     data.parts[i].name,
                            typeline: data.parts[i].typeline,
                            text:     data.parts[i].text,
                        });
                    }
                }

                await baseCard.save();

                const oldPrint = await Print.findOne({
                    $or: [
                        { set, number: data.number, lang: v.lang },
                        { multiverseId: { $in: vMids } },
                    ],
                });

                if (oldPrint != null) {
                    continue;
                }

                const newData = basePrint.toObject();

                delete (newData as any)._id;
                delete (newData as any).__v;

                newData.number = data.number;
                newData.lang = v.lang;

                for (const [i, p] of newData.parts.entries()) {
                    // fix meld card issue
                    const dPart = data.parts[i - newData.parts.length + data.parts.length];

                    delete p.scryfallIllusId;

                    p.name = dPart.name;
                    p.typeline = dPart.typeline;
                    p.text = dPart.text;

                    if (dPart.flavorText !== '') {
                        p.flavorText = dPart.flavorText;
                    } else {
                        delete p.flavorText;
                    }
                }

                if (!newData.tags.includes('dev:printed')) {
                    newData.tags.push('dev:printed');
                }

                delete newData.scryfall.cardId;
                newData.scryfall.imageUris = [];
                delete newData.arenaId;
                delete newData.mtgoId;
                delete newData.mtgoFoilId;
                newData.multiverseId = vMids;
                delete newData.tcgPlayerId;
                delete newData.cardMarketId;

                new Print(newData).save();

                this.statusMap[number]![0] += 1;
                console.log(`${v.id}:${v.lang}, ${i + 1}/${versionsToParse.length}`);
            } catch (e) {
                console.log(e);
                continue;
            }
        }
    }

    stopImpl(): void {

    }

    equals(): boolean { return true; }
}

// TODO resolve duplicate code
export default async function parseGatherer(
    mids: number[],
    set: string,
    number: string,
    lang: string,
): Promise<void> {
    await saveGathererImage(mids, set, number, lang);

    const basePrint = await Print.findOne({ set, number, lang });

    if (basePrint == null) {
        return;
    }

    const baseCard = await Card.findOne({ cardId: basePrint.cardId });

    if (baseCard == null) {
        return;
    }

    const versions = await parseVersion(mids[0]);

    const prints = await Print.find({ multiverseId: { $in: versions.map(v => v.id).filter(v => v != null) } });

    const versionsToParse = [];

    for (const v of versions) {
        if (v.id != null && prints.every(c => !c.multiverseId.includes(v.id!))) {
            versionsToParse.push(v);
        }
    }

    for (const [i, v] of versionsToParse.entries()) {
        const vMids = mids.map((_, index) => v.id! + index);
        try {
            const data = await parseGathererDetail(vMids);

            await saveGathererImage(vMids, set, data.number, v.lang);

            for (const [i, p] of baseCard.parts.entries()) {
                const loc = p.localization.find(l => l.lang === lang);

                if (loc == null) {
                    p.localization.push({
                        lang,
                        name:     data.parts[i].name,
                        typeline: data.parts[i].typeline,
                        text:     data.parts[i].text,
                    });
                }
            }

            await baseCard.save();

            const oldPrint = await Print.findOne({
                $or: [
                    { set, number: data.number, lang: v.lang },
                    { multiverseId: { $in: vMids } },
                ],
            });

            if (oldPrint != null) {
                if (oldPrint.multiverseId.length === 0) {
                    oldPrint.multiverseId = vMids;
                    await oldPrint.save();

                    console.log(`${v.id}:${v.lang}, ${i + 1}/${versionsToParse.length} (*)`);
                }

                continue;
            }

            const newData = basePrint.toObject();

            delete (newData as any)._id;
            delete (newData as any).__v;

            newData.number = data.number;
            newData.lang = v.lang;

            for (const [i, p] of newData.parts.entries()) {
                // fix meld card issue
                const dPart = data.parts[i - newData.parts.length + data.parts.length];

                delete p.scryfallIllusId;

                p.name = dPart.name;
                p.typeline = dPart.typeline;
                p.text = dPart.text;

                if (dPart.flavorText !== '') {
                    p.flavorText = dPart.flavorText;
                } else {
                    delete p.flavorText;
                }
            }

            if (!newData.tags.includes('dev:printed')) {
                newData.tags.push('dev:printed');
            }

            delete newData.scryfall.cardId;
            newData.scryfall.imageUris = [];
            delete newData.arenaId;
            delete newData.mtgoId;
            delete newData.mtgoFoilId;
            newData.multiverseId = vMids;
            delete newData.tcgPlayerId;
            delete newData.cardMarketId;

            new Print(newData).save();

            console.log(`${v.id}:${v.lang}, ${i + 1}/${versionsToParse.length}`);
        } catch (e) {
            console.log(e);
            continue;
        }
    }
}
