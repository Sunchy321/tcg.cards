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

export async function parseGatherer(multiverseId: number) {
    const { data: html } = await axios.get(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseId}&printed=true`);
    const $ = cheerio.load(html);

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
