import axios from 'axios';
import cheerio from 'cheerio';

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

        const card = hydrationData[1][3].children[2][3].children[1][3].children[3].children[0][3].children[3].card as Card;

        return {
            name:       card.instanceName,
            typeline:   card.instanceTypeLine,
            text:       card.instanceText.replace(/&lt;\/?.&gt;/g, ''),
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
