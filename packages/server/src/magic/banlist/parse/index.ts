import { parseWizardsBanlist, parseWizardsOldBanlist } from './wizards';
import { parseDuelCommanderBanlist } from './duelcommander';
import { parseMTGCommanderBanlist } from './mtgcommander';

import { Announcement as IFormatAnnouncement } from '@interface/magic/format-change';

export default async function parseBanlist(url: string): Promise<IFormatAnnouncement> {
    if (url.startsWith('https://magic.wizards.com/')) {
        // Wizards of the Coast
        return parseWizardsBanlist(url);
    } else if (url.startsWith('http://www.wizards.com/default.asp')) {
        // WotC Old Page
        return parseWizardsOldBanlist(url);
    } else if (url.startsWith('http://mtgcommander.net/')) {
        // MTG commander
        return parseMTGCommanderBanlist(url);
    } else if (url.startsWith('https://www.duelcommander.com/')) {
        // Duel commander
        return parseDuelCommanderBanlist(url);
    } else {
        throw new Error('Unknown url');
    }
}
