import axios from 'axios';
import * as cheerio from 'cheerio';

import { db } from '@/drizzle';
import { Gatherer, type GathererData } from '@/magic/schema/data/gatherer';
import { eq } from 'drizzle-orm';

// Cache expiration time: 30 days
const CACHE_EXPIRATION_DAYS = 30;

const numberMap: Record<string, string> = {
    '０': '0',
    '１': '1',
    '２': '2',
    '３': '3',
    '４': '4',
    '５': '5',
    '６': '6',
    '７': '7',
    '８': '8',
    '９': '9',
    'Ｘ': 'X',
};

const symbolMap: Record<string, string> = {
    '-': '-',
    '—': '-',
    '―': '-',
    '－': '-',
    '–': '-',
    '−': '-',

    '＋': '+',
    '+': '+',
};

const replacer = (_: string, sym: string, num: string) => `[${symbolMap[sym]}${num.split('').map(n => numberMap[n] ?? n).join('')}]`;

async function fetchFromGatherer(multiverseId: number) {
    const { data: html } = await axios.get(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseId}&printed=true`);
    const $ = cheerio.load(html);

    const script = $('script').filter((_, el) => {
        const innerHtml = $(el).html() ?? '';

        return innerHtml.includes('__next_f') && innerHtml.includes('instanceName');
    }).get(0);

    const hydration = $(script).html()!.replace(/^self.__next_f\.push\(\[\d+,"\d+:/, '"').replace(/\]\)$/, '');

    try {
        const hydrationText = JSON.parse(hydration);
        const hydrationData = JSON.parse(hydrationText);

        function recursiveFindCard(obj: any): GathererData | null {
            if (obj == null) {
                return null;
            }

            if (obj.card != null) {
                return obj.card as GathererData;
            }

            if (Array.isArray(obj)) {
                if (Array.isArray(obj[0])) {
                    return recursiveFindCard(obj[0][3]);
                } else if (Array.isArray(obj[1])) {
                    return recursiveFindCard(obj[1][3]);
                } else {
                    return recursiveFindCard(obj[3]);
                }
            }

            if (obj.children != null) {
                return recursiveFindCard(obj.children);
            }

            console.log('No card found in', Bun.inspect(obj, { depth: 5 }));
            return null;
        }

        const card = recursiveFindCard(hydrationData);

        if (card == null) {
            console.log(Bun.inspect(hydrationData, { depth: 10 }));

            throw new Error('Card data not found in hydration');
        }

        // Return full card data for caching
        return card;
    } catch (e) {
        console.error(e);
        throw new Error('Failed to parse Gatherer data');
    }
}

export async function parseGatherer(multiverseId: number) {
    // Check cache first
    const cached = await db
        .select()
        .from(Gatherer)
        .where(eq(Gatherer.multiverseId, multiverseId))
        .limit(1);

    let cardData: GathererData;

    // Return cached data if exists and not expired
    if (cached.length > 0 && cached[0].expiresAt > new Date() && cached[0].data != null) {
        cardData = cached[0].data as GathererData;
    } else {
        // Fetch data from Gatherer
        cardData = await fetchFromGatherer(multiverseId);

        // Save or update cache
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + CACHE_EXPIRATION_DAYS);

        await db
            .insert(Gatherer)
            .values({
                multiverseId,
                data: cardData,
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [Gatherer.multiverseId],
                set:    {
                    data:      cardData,
                    createdAt: new Date(),
                    expiresAt,
                },
            });
    }

    // Parse and return the text from cached data
    const text = (cardData.instanceText ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/&lt;\/?.&gt;/g, '')
        // {UUU} -> {U}{U}{U}
        .replace(/\{([A-Z0-9]{2,})\}/g, (_, mana) => (mana as string).split('').map(v => `{${v}}`).join(''))
        // {(u/b)} -> {U/B}
        .replace(/\{\(\}?([^{}()]*)\)\}?/g, (_, text) => `{${(text as string).toUpperCase()}}`)
        // {Si} -> {S}
        .replace(/\{Si\}/g, '{S}')
        // oW -> {W}
        .replace(/\b((?:o[oc]?[A-Z0-9])+)\b/g, (_, symbols) => {
            return (symbols as string)
                .split(/(o[oc]?[A-Z0-9])/)
                .filter(v => v != '')
                .map(v => {
                    const symbol = '{' + v.replace(/^o[oc]?/, '') + '}';

                    if (v.startsWith('oo')) {
                        return symbol + ':';
                    } else {
                        return symbol;
                    }
                })
                .join('');
        })
        .replace(/^([-—―－–−＋+])([0-9X０-９Ｘ]+)(?!\/)/mg, replacer)
        .replace(/\[([-—―－–−＋+])([0-9X０-９Ｘ]+)\]/mg, replacer)
        .replace(/^[0０](?=[:：]| :)/mg, '[0]')
        .replace(/\[０\]/mg, '[0]');

    const flavorText = cardData.flavorText
        ?.replace(/\r\n?/g, '\n')
        ?.replace(/[‘’]/g, '\'');

    return {
        name:     cardData.instanceName,
        typeline: cardData.instanceTypeLine ?? '',
        text,
        flavorText,
    };
}
