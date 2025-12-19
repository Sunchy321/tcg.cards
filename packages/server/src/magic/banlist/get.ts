import { Banlist } from '@interface/magic/format-change';

import request from 'request-promise-native';
import * as cheerio from 'cheerio';

import { toIdentifier } from '@common/util/id';

export async function getWizardsBanlist(): Promise<Record<string, Banlist>> {
    const html = await request('https://magic.wizards.com/en/game-info/gameplay/rules-and-formats/banned-restricted');
    const $ = cheerio.load(html);

    const result: Record<string, Banlist> = { };

    {
        const elems = $('#standard-banned-cards a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.standard = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const elems = $('#bnr-pioneer a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.pioneer = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const elems = $('#modern-banned-cards a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.modern = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const elems = $('#legacy-banned-cards a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.legacy = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const ul = $('#vintage-banned-and-restricted-cards > ul').get();

        const elemsBanned = $(ul[0]).find('a.autocard-link').get();

        const cardsBanned = elemsBanned.map(e => toIdentifier($(e).text())).sort();

        const elemsRestricted = $(ul[1]).find('a.autocard-link').get();

        const cardsRestricted = elemsRestricted.map(e => toIdentifier($(e).text())).sort();

        result.vintage = Object.fromEntries([
            ...cardsBanned.map(c => [c, 'banned']),
            ...cardsRestricted.map(c => [c, 'restricted']),
        ]);
    }

    {
        const elems = $('#commander-banned-cards a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.commander = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const elems = $('#bnr-brawl a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.brawl = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    {
        const elems = $('#pauper-banned-cards a.autocard-link').get();
        const cards = elems.map(e => toIdentifier($(e).text())).sort();
        result.pauper = Object.fromEntries(cards.map(c => [c, 'banned']));
    }

    return result;
}
