import { Format as IFormat } from '@model/magic/schema/format';

import {
    FormatChange as IFormatChange,
    SetChange as ISetChange,
    CardChange as ICardChange,
    Legality,
    Status,
} from '@model/magic/schema/game-change';

import _ from 'lodash';
import { and, eq, inArray, sql } from 'drizzle-orm';
import internalData from '@/internal-data';
import { toIdentifier } from '@common/util/id';

import { db } from '@/drizzle';
import { CardView } from '@/magic/schema/card';
import { CardPrintView } from '@/magic/schema/print';
import { Set } from '@/magic/schema/set';
import { Format } from '@/magic/schema/format';
import { AnnouncementView } from '@/magic/schema/announcement';
import { CardChange, SetChange, FormatChange } from '@/magic/schema/game-change';

import { banlistStatusOrder, banlistSourceOrder } from '@static/magic/misc';

import { announcement as log } from '@/magic/logger';

const formatWithSet = [
    'standard', 'pioneer', 'modern', 'extended',
    'alchemy', 'historic', 'explorer', 'timeless',
];

function cmp<T>(a: T, b: T): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

type IAnnouncementView = (typeof AnnouncementView)['$inferSelect'];

export class AnnouncementApplier {
    private announcements: IAnnouncementView[];

    private formatMap:      Record<string, IFormat>;
    private eternalFormats: string[];

    private sets: { setId: string, releaseDate: string }[];

    private anteList:       string[];
    private conspiracyList: string[];
    private legendaryList:  string[];
    private unfinityList:   string[];
    private offensiveList:  string[];

    private cards: {
        cardId:            string;
        sets:              string[];
        inPauper:          boolean;
        inPauperCommander: boolean;
    }[];

    private formatChanges: IFormatChange[];
    private setChanges:    ISetChange[];
    private cardChanges:   ICardChange[];

    private groupWatcher: {
        source:  string;
        link:    string[];
        name:    string;
        format:  string;
        groupId: string;
        status:  Legality;
    }[];

    private async initialize(): Promise<void> {
        // load announcements
        this.announcements = await db.select().from(AnnouncementView);

        // load formats
        const formats = await db.select().from(Format);

        this.formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));
        this.eternalFormats = formats.filter(f => f.tags?.includes('eternal')).map(f => f.formatId);

        // load sets
        const sets = await db.select()
            .from(Set)
            .where(inArray(Set.type, ['core', 'expansion', 'draft_innovation', 'funny', 'alchemy', 'commander']));

        this.sets = sets.map(s => ({ setId: s.setId, releaseDate: s.releaseDate! }));

        // preload group cards
        this.anteList = internalData<string[]>('magic.banlist.ante').map(toIdentifier);
        this.offensiveList = internalData<string[]>('magic.banlist.offensive').map(toIdentifier);
        this.unfinityList = internalData<string[]>('magic.banlist.unfinity').map(toIdentifier);

        // all conspiracy
        this.conspiracyList = await db.select({ cardId: CardView.cardId })
            .from(CardView)
            .where(sql`'conspiracy' = any(${CardView.part.typeMain})`)
            .then(cards => cards.map(c => c.cardId));

        // legendary cards are legal after 1995-11-01
        this.legendaryList = await db.select({ cardId: CardPrintView.cardId })
            .from(CardPrintView)
            .where(and(
                sql`'legendary' = any(${CardPrintView.cardPart.typeSuper})`,
                sql`${CardPrintView.print.releaseDate} <= '1995-11-01'`,
            ))
            .then(cards => cards.map(c => c.cardId));
    }

    private async loadCard(): Promise<void> {
        const cards: string[] = [];

        cards.push(...this.anteList);
        cards.push(...this.conspiracyList);
        cards.push(...this.offensiveList);
        cards.push(...this.unfinityList);
        cards.push(...this.legendaryList);

        for (const a of this.announcements) {
            if (a.cardId != null && !cards.includes(a.cardId)) {
                cards.push(a.cardId);
            }
        }

        this.cards = await db.select({
            cardId:   CardPrintView.cardId,
            typeMain: CardPrintView.cardPart.typeMain,
            sets:     sql<string[]>`array_agg(distinct ${CardPrintView.set})`,
            rarity:   sql<string[]>`array_agg(distinct ${CardPrintView.print.rarity})`,
        })
            .from(CardPrintView)
            .where(inArray(CardPrintView.cardId, cards))
            .groupBy(CardPrintView.cardId, CardPrintView.cardPart.typeMain)
            .then(cards => cards.map(c => ({
                cardId:   c.cardId,
                sets:     c.sets,
                inPauper: c.rarity.includes('common'),
                inPauperCommander:
                    c.typeMain.includes('creature')
                        ? (c.rarity.includes('common') || c.rarity.includes('uncommon'))
                        : c.rarity.includes('common'),
            })));
    }

    private getCardList(group: string): string[] {
        switch (group) {
        case 'ante': return this.anteList;
        case 'conspiracy': return this.conspiracyList;
        case 'offensive': return this.offensiveList;
        case 'unfinity': return this.unfinityList;
        case 'legendary': return this.legendaryList;
        default: return [];
        }
    }

    private detectGroup(group: string, format: string, sets?: string[]): string[] {
        return this.getCardList(group).filter(c => {
            const data = this.cards.find(d => d.cardId === c);

            if (data == null) {
                return false;
            }

            if (format === 'pauper' && !data.inPauper) {
                return false;
            } else if ((format === 'pauper_commander' || format === 'pauper_duelcommander') && !data.inPauperCommander) {
                return false;
            }

            if (sets == null) {
                return true;
            } else {
                return data.sets.some(s => sets.includes(s));
            }
        });
    }

    private setChange(
        setId: string,
        status: Status,
        format: string,
        options: {
            source:        string;
            date:          string;
            name:          string;
            effectiveDate: string;
            link:          string[];
        },
    ): void {
        const { source, date, name, effectiveDate, link } = options;

        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        if (status !== 'legal' && status !== 'unavailable') {
            throw new Error(`Invalid status ${status} for set ${setId} in format ${format}`);
        }

        log.info(`SET   - ${date} ${format} ${setId} ${status}`);

        this.setChanges.push({
            source,
            date,
            effectiveDate,
            name,
            link,

            type: 'set_change',
            format,

            setId,

            status,
        });

        if (!f.tags.includes('eternal')) {
            this.formatChanges.push({
                source,
                date,
                effectiveDate,
                name,
                link,

                type: 'set_change',
                format,

                cardId: null,
                setId,
                ruleId: null,
                group:  null,

                status,

                adjustment: null,
            });
        }

        if (f.sets == null) {
            f.sets = [];
        }

        if (status === 'legal') {
            f.sets.push(setId);
        } else {
            f.sets = f.sets.filter(s => s !== setId);
        }
    }

    private cardChange(
        cardId: string,
        status: Status,
        format: string,
        options: {
            group:         string | undefined;
            source:        string;
            date:          string;
            name:          string;
            effectiveDate: string;
            link:          string[];
        },
    ): void {
        const { group, source, date, name, effectiveDate, link } = options;

        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        if (status === 'buff' || status === 'nerf' || status === 'adjust') {
            throw new Error(`Invalid status ${status} for card ${cardId} in format ${format}`);
        }

        log.info(`CARD  - ${date} ${format} ${cardId} ${status}${group != null ? ` (${group})` : ''}`);

        this.cardChanges.push({
            source,
            date,
            effectiveDate,
            name,
            link,

            type: 'card_change',
            format,

            cardId,
            setId: null,
            group: group ?? null,

            status,

            adjustment: null,
        });

        this.formatChanges.push({
            source,
            date,
            effectiveDate,
            name,
            link,

            type: 'card_change',
            format,

            cardId,
            setId:  null,
            ruleId: null,
            group:  group ?? null,

            status,

            adjustment: null,
        });

        if (f.banlist == null) {
            f.banlist = [];
        }

        if (['legal', 'unavailable'].includes(status)) {
            f.banlist = f.banlist.filter(v => v.cardId !== cardId);
        } else {
            const b = f.banlist.find(v => v.cardId === cardId);

            if (b == null) {
                f.banlist.push({
                    cardId,
                    status,
                    date,
                    group: group ?? null,
                });
            } else {
                b.status = status;
                b.date = date;
                b.group = group ?? null;
            }
        }
    }

    async apply(): Promise<void> {
        log.info('================ Applying Magic banlist... ================');

        await this.initialize();
        await this.loadCard();

        log.info('Loaded Magic banlist data');

        this.formatChanges = [];
        this.setChanges = [];
        this.cardChanges = [];

        this.groupWatcher = [];

        const alchemyBirthday = this.formatMap.alchemy.birthday!;
        const standardBrawlBirthday = this.formatMap.standard_brawl.birthday!;

        for (const f of Object.values(this.formatMap)) {
            f.sets = [];
            f.banlist = [];
        }

        await db.delete(CardChange);
        await db.delete(SetChange);
        await db.delete(FormatChange);

        const pseudoReleaseAnnouncement = this.sets.filter(
            s => !this.announcements.some(a => a.format === '#standard' && a.setId === s.setId && a.status === 'legal'),
        ).map(s => ({
            id: '',

            source:                'release',
            date:                  s.releaseDate,
            effectiveDate:         s.releaseDate,
            effectiveDateTabletop: s.releaseDate,
            effectiveDateOnline:   s.releaseDate,
            effectiveDateArena:    s.releaseDate,
            nextDate:              null,

            name: `release - ${s.releaseDate}`,
            link: [],

            type:   'set_change',
            format: '#eternal',

            cardId: null,
            setId:  s.setId,
            ruleId: null,

            status: 'legal',
            group:  null,

            adjustment:   null,
            relatedCards: null,
        } as IAnnouncementView));

        const pseudoInitialAnnouncement = Object.values(this.formatMap)
            .filter(f => f.tags.includes('eternal') && f.birthday != null)
            .map(f => this.sets.filter(s => s.releaseDate < f.birthday!).map(s => ({
                id: '',

                source:                'initial',
                date:                  f.birthday!,
                effectiveDate:         f.birthday!,
                effectiveDateTabletop: f.birthday!,
                effectiveDateOnline:   f.birthday!,
                effectiveDateArena:    f.birthday!,
                nextDate:              null,

                name: `release - ${f.birthday!}`,
                link: [],

                type:   'set_change',
                format: f.formatId,

                cardId: null,
                setId:  s.setId,
                ruleId: null,

                status: 'legal',
                group:  null,

                adjustment:   null,
                relatedCards: null,
            }) as IAnnouncementView))
            .flat();

        const allAnnouncements: IAnnouncementView[] = [
            ...this.announcements,
            ...pseudoReleaseAnnouncement,
            ...pseudoInitialAnnouncement,
        ].sort((a, b) => cmp(a.date, b.date));

        for (const a of allAnnouncements) {
            const effectiveDate = a.effectiveDate ?? a.date;

            const formats = (() => {
                switch (a.format) {
                case '#alchemy':
                    return ['alchemy', 'historic', 'timeless'].filter(f => {
                        const format = this.formatMap[f]!;
                        // the change don't become effective now
                        if (effectiveDate > new Date().toISOString().split('T')[0]) { return false; }
                        // the change is before the format exists
                        if (format.birthday != null && effectiveDate < format.birthday) { return false; }
                        // the change is after the format died
                        if (format.deathdate != null && effectiveDate > format.deathdate) { return false; }
                        return true;
                    });
                case '#standard':
                    return [...this.eternalFormats, ...formatWithSet].filter(f => {
                        const format = this.formatMap[f]!;
                        // the change don't become effective now
                        if (effectiveDate > new Date().toISOString().split('T')[0]) { return false; }
                        // the change is before the format exists
                        if (format.birthday != null && effectiveDate < format.birthday) { return false; }
                        // the change is after the format died
                        if (format.deathdate != null && effectiveDate > format.deathdate) { return false; }
                        return true;
                    });
                case '#eternal':
                    return [...this.eternalFormats].filter(f => {
                        const format = this.formatMap[f]!;
                        // the change don't become effective now
                        if (effectiveDate > new Date().toISOString().split('T')[0]) { return false; }
                        // the change is before the format exists
                        if (format.birthday != null && effectiveDate < format.birthday) { return false; }
                        // the change is after the format died
                        if (format.deathdate != null && effectiveDate > format.deathdate) { return false; }
                        return true;
                    });
                default:
                    return a.format == null ? [] : [a.format];
                }
            })();

            if (formats.includes('standard')) {
                if (!formats.includes('standard_brawl') && effectiveDate >= standardBrawlBirthday) {
                    formats.push('standard_brawl');
                }
            }

            if (formats.includes('historic')) {
                if (!formats.includes('brawl')) {
                    formats.push('brawl');
                }
            }

            // apply changes
            for (const f of formats) {
                const fo = this.formatMap[f];

                if (fo == null) {
                    continue;
                }

                fo.sets ??= [];

                if (a.type === 'set_change') {
                    if (a.setId == null) {
                        throw new Error(`Set change without setId, date: ${a.date}`);
                    }

                    if (a.status === 'legal') {
                        if (fo.sets.includes(a.setId!)) {
                            if (['historic', 'brawl'].includes(fo.formatId) && a.date === alchemyBirthday) {
                            // Alchemy initial, ignore duplicate
                            } else {
                                throw new Error(`In set ${a.setId} is already in ${f}, date: ${a.date}`);
                            }
                        }
                    } else if (a.status === 'unavailable') {
                        if (!fo.sets.includes(a.setId!)) {
                            throw new Error(`Out set ${a.setId} is not in ${f}, date: ${a.date}`);
                        }
                    } else {
                        throw new Error(`Invalid status ${a.status} for set ${a.setId} in format ${f}`);
                    }

                    this.setChange(a.setId!, a.status!, f, {
                        source: a.source,
                        date:   a.date,
                        name:   a.name,
                        effectiveDate,
                        link:   a.link,
                    });

                    if (a.status === 'legal') {
                        for (const g of this.groupWatcher.filter(g => g.format === f)) {
                            const detectedCards = this.detectGroup(g.groupId, f, [a.setId]);

                            const cards = detectedCards.filter(
                                c => !fo.banlist.some(b => b.cardId === c && b.status === g.status),
                            );

                            for (const v of cards) {
                                this.cardChange(v, g.status, f, {
                                    group:         g.groupId,
                                    source:        g.source,
                                    date:          effectiveDate,
                                    name:          g.name,
                                    effectiveDate: effectiveDate,
                                    link:          g.link,
                                });
                            }
                        }
                    } else if (a.status === 'unavailable') {
                        for (const b of fo.banlist) {
                            const sets = this.cards.find(c => c.cardId === b.cardId)?.sets ?? [];

                            const setInFormat = sets.filter(s => [...fo.sets ?? [], a.setId]!.includes(s));

                            if (setInFormat.every(s => s === a.setId)) {
                                this.cardChange(b.cardId, 'unavailable', f, {
                                    group:  b.group ?? undefined,
                                    source: a.source,
                                    date:   a.date,
                                    name:   a.name,
                                    effectiveDate,
                                    link:   a.link,
                                });
                            }
                        }
                    }
                } else if (a.type === 'card_change') {
                    if (a.cardId == null) {
                        throw new Error(`Card change without cardId, date: ${a.date}`);
                    }

                    if (a.status == 'buff' || a.status == 'nerf' || a.status == 'adjust') {
                        throw new Error(`Invalid status ${a.status} for card ${a.cardId} in format ${f}`);
                    }

                    if (a.cardId.startsWith('#{clone')) {
                        // clones from other format
                        const srcFormats = /^#\{clone:(.*)\}/.exec(a.cardId)![1].split(',');

                        const newChanges: { cardId: string, status: Legality, group: string | null }[] = [];

                        for (const f of srcFormats) {
                            for (const bo of this.formatMap[f].banlist) {
                                if (!fo.banlist.some(bf => bf.cardId === bo.cardId)) {
                                    newChanges.push({
                                        cardId: bo.cardId,
                                        status: a.status ?? bo.status,
                                        group:  bo.group,
                                    });
                                }
                            }
                        }

                        newChanges.sort((a, b) => cmp(a.cardId, b.cardId));

                        for (const n of newChanges) {
                            this.cardChange(n.cardId, n.status, f, {
                                group:  n.group ?? undefined,
                                source: a.source,
                                date:   a.date,
                                name:   a.name,
                                effectiveDate,
                                link:   a.link,
                            });
                        }

                        continue;
                    }

                    if (a.status == null) {
                        throw new Error(`Card change without status for card ${a.cardId} in format ${f}, date: ${a.date}`);
                    }

                    if (a.cardId.startsWith('#')) {
                        // card banned as a group
                        const group = a.cardId.slice(1);

                        if (!['legal', 'unavailable'].includes(a.status)) {
                            const index = this.groupWatcher.findIndex(g => g.groupId === group && g.format === f);

                            if (index === -1) {
                                this.groupWatcher.push({
                                    source:  a.source,
                                    link:    a.link,
                                    name:    a.name,
                                    groupId: group,
                                    format:  f,
                                    status:  a.status,
                                });
                            } else {
                                this.groupWatcher[index].source = a.source;
                                this.groupWatcher[index].link = a.link;
                                this.groupWatcher[index].name = a.name;
                                this.groupWatcher[index].status = a.status;
                            }

                            const cards = this.detectGroup(group, f, fo.sets);

                            for (const v of cards) {
                                this.cardChange(v, a.status, f, {
                                    group:  group ?? null,
                                    source: a.source,
                                    date:   effectiveDate,
                                    name:   a.name,
                                    effectiveDate,
                                    link:   a.link,
                                });
                            }
                        } else {
                            const index = this.groupWatcher.findIndex(g => g.groupId === group && g.format === f);

                            if (index === -1) {
                                throw new Error(`Out group ${group} is not in ${f}, date: ${a.date}`);
                            }

                            this.groupWatcher.splice(index, 1);

                            const cardsRemoved = fo.banlist.filter(v => v.group === group).map(v => v.cardId);

                            for (const v of cardsRemoved) {
                                this.cardChange(v, a.status, f, {
                                    group,
                                    source: a.source,
                                    date:   effectiveDate,
                                    name:   a.name,
                                    effectiveDate,
                                    link:   a.link,
                                });
                            }
                        }
                    } else {
                        this.cardChange(a.cardId, a.status, f, {
                            group:  undefined,
                            source: a.source,
                            date:   a.date,
                            name:   a.name,
                            effectiveDate,
                            link:   a.link,
                        });
                    }
                } else if (a.type === 'rule_change') {
                    this.formatChanges.push({
                        source:        a.source,
                        date:          a.date,
                        effectiveDate: a.effectiveDate,
                        name:          a.name,
                        link:          a.link,

                        type:   'rule_change',
                        format: a.format,

                        cardId: a.cardId,
                        setId:  a.setId,
                        ruleId: a.ruleId,
                        group:  null,

                        status: a.status,

                        adjustment: a.adjustment,
                    });
                }
            }
        }

        for (const chunk of _.chunk(this.cardChanges, 500)) {
            await db.insert(CardChange).values(chunk);
        }

        for (const chunk of _.chunk(this.setChanges, 500)) {
            await db.insert(SetChange).values(chunk);
        }

        for (const chunk of _.chunk(this.formatChanges, 500)) {
            await db.insert(FormatChange).values(chunk);
        }

        for (const format of Object.values(this.formatMap)) {
            if (format.tags.includes('eternal') || format.sets?.length === 0) {
                format.sets = null;
            }

            format.banlist.sort((a, b) => {
                if (a.status !== b.status) {
                    return banlistStatusOrder.indexOf(a.status)
                      - banlistStatusOrder.indexOf(b.status);
                } else if (a.group !== b.group) {
                    return banlistSourceOrder.indexOf(a.group ?? null)
                      - banlistSourceOrder.indexOf(b.group ?? null);
                } else {
                    return cmp(a.cardId, b.cardId);
                }
            });

            await db.update(Format)
                .set(format)
                .where(eq(Format.formatId, format.formatId));
        }

        log.info(`Applied ${this.cardChanges.length} card changes, ${this.setChanges.length} set changes, and ${this.formatChanges.length} format changes.`);

        log.info('===========================================================');
    }
}
