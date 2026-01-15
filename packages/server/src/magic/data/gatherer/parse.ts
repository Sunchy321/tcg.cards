import axios from 'axios';
import * as cheerio from 'cheerio';

function toText(elem: cheerio.Element, $: cheerio.Root): string {
    if (elem.type === 'text') {
        return $(elem).text();
    }

    if ($(elem).attr('data-manacost') != null) {
        const manaCost = $(elem).attr('data-manacost')!;

        return '{' + manaCost.replace(/[()]/g, '') + '}';
    }

    if ($(elem).hasClass('block')) {
        return '\n';
    }

    return $(elem).contents().get().map(e => toText(e, $)).join('');
}

interface Card {
    resourceId:          string;
    multiverseId:        number;
    kind:                'CardData';
    id:                  string;
    convertedManaCost:   string;
    cardColor:           string;
    cardNumber:          string;
    cardNumberVariant:   string;
    englishLanguageName: string;
    instanceName:        string;
    language: {
        englishName:     string;
        originalName:    string;
        isoCountryCode:  string;
        isoLanguageCode: string;
        code:            string;
    };
    languageCode:       string;
    nativeLanguageName: string;
    oracleName:         string;
    nameKebab:          string;
    rarityCode:         string;
    rarityName:         string;
    setCode:            string;
    setName:            string;
    artistName:         string;
    flavorText:         string;
    instanceManaText:   string;
    instanceSubtype:    string;
    instanceText:       string;
    instanceType:       string;
    instanceTypeLine:   string;
    oracleManaText:     string;
    oracleSubtype:      string;
    oracleText:         string;
    oracleType:         string;
    oracleTypeLine:     string;
    oracleTypes:        string[];
    oracleSubtypes:     string[];
    oracleSupertypes:   string[];
    instanceTypes:      string[];
    instanceSubtypes:   string[];
    instanceSupertypes: string[];
    imageUrls:          Record<string, string>;

    colors: {
        colorCode: string;
        colorName: string;
    }[];

    formatLegalities: {
        formatName: string;
        legality:   string;
    }[];

    relatedCardInstances: {
        cardNumber:        string;
        cardNumberVariant: string;
        instanceName:      string;
        languageCode:      string;
        oracleName:        string;
        nameKebab:         string;
        resourceId:        string;
        setCode:           string;
        setName:           string;
        setReleaseDate:    string;
        imageUrls:         Record<string, string>;
    }[];

    rulings: {
        rulingDate:      string;
        rulingStatement: string;
    }[];

    setReleaseDate: string;

    otherLanguages: {
        englishName:     string;
        originalName:    string;
        isoCountryCode:  string;
        isoLanguageCode: string;
        code:            string;
    }[];

}

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

export async function parseGatherer(multiverseId: number) {
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

        function recursiveFindCard(obj: any): Card | null {
            if (obj == null) {
                return null;
            }

            if (obj.card != null) {
                return obj.card as Card;
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

        const text = card.instanceText
            .replace(/\r\n?/g, '\n')
            .replace(/&lt;\/?.&gt;/g, '')
            // {UUU} -> {U}{U}{U}
            .replace(/\{([A-Z0-9]{2,})\}/g, (_, mana) => (mana as string).split('').map(v => `{${v}}`).join(''))
            // {(u/b)} -> {U/B}
            .replace(/\{\((.*)\)\}/g, (_, text) => `{${(text as string).toUpperCase()}}`)
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

        return {
            name:       card.instanceName,
            typeline:   card.instanceTypeLine,
            text,
            flavorText: card.flavorText,
        };
    } catch (e) {
        console.error(e);
    }

    const name = $('[data-testid=cardDetailsCardName]').text().trim();
    const typeline = $('[data-testid=cardDetailsTypeLine]').text().trim();
    const text = toText($('[data-testid=cardDetailsOracleText]').get(0), $);

    const flavorTextElem = $('[data-testid=cardDetailsFlavorText]').get(0);

    const flavorText = flavorTextElem != null ? toText(flavorTextElem, $) : undefined;

    return {
        name,
        typeline,
        text,
        flavorText,
    };
}
