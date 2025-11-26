import { Format as IFormat } from '@model/hearthstone/schema/format';

import {
    FormatChange as IFormatChange,
    SetChange as ISetChange,
    CardChange as ICardChange,
    Legality,
    Status,
} from '@model/hearthstone/schema/game-change';

import _ from 'lodash';
import { and, eq, gt, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/drizzle';
import { CardEntityView } from '@/hearthstone/schema/entity';
import { Set } from '@/hearthstone/schema/set';
import { Format } from '@/hearthstone/schema/format';
import { AnnouncementView } from '@/hearthstone/schema/announcement';
import { CardChange, SetChange, FormatChange } from '@/hearthstone/schema/game-change';

import { banlistStatusOrder, banlistSourceOrder } from '@static/hearthstone/misc';

import { announcement as log } from '@/hearthstone/logger';

function cmp<T>(a: T, b: T): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

type IAnnouncementView = (typeof AnnouncementView)['$inferSelect'];

export class AnnouncementApplier {
    private announcements: IAnnouncementView[] = [];

    private formatMap: Record<string, IFormat> = { };

    private sets: { setId: string, releaseDate: string }[] = [];

    private groups: Record<string, string[]> = {
        cThun: [
            'OG_096',
            'OG_131',
            'OG_162',
            'OG_188',
            'OG_255',
            'OG_280',
            'OG_281',
            'OG_282',
            'OG_283',
            'OG_284',
            'OG_286',
            'OG_293',
            'OG_301',
            'OG_302',
            'OG_303',
            'OG_321',
            'OG_334',
            'OG_339',
        ],
        oddEven: [
            'GIL_130',
            'GIL_530',
            'GIL_692',
            'GIL_826',
            'GIL_837',
            'GIL_838',
        ],
        invoke: [
            'DRG_019',
            'DRG_021',
            'DRG_027',
            'DRG_030',
            'DRG_050',
            'DRG_202',
            'DRG_203',
            'DRG_217',
            'DRG_218',
            'DRG_242',
            'DRG_246',
            'DRG_247',
            'DRG_248',
            'DRG_249',
            'DRG_250',
            'DRG_300',
            'DRG_303',
        ],
    };

    private cards: {
        cardId:  string;
        version: number[];
        sets:    string[];
    }[] = [];

    private formatChanges: IFormatChange[] = [];
    private setChanges:    ISetChange[] = [];
    private cardChanges:   ICardChange[] = [];

    private groupWatcher: {
        source:  string;
        link:    string[];
        name:    string;
        format:  string;
        groupId: string;
        status:  Legality;
        score:   number | null;
    }[] = [];

    private async initialize(): Promise<void> {
        // load announcements
        this.announcements = await db.select().from(AnnouncementView);

        // load formats
        const formats = await db.select().from(Format);

        this.formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));

        // load sets
        this.sets = await db.select({
            setId:       Set.setId,
            releaseDate: Set.releaseDate,
        })
            .from(Set)
            .then(sets => sets.map(s => ({
                setId:       s.setId,
                releaseDate: s.releaseDate,
            })));

        // preload group cards
        this.groups.hero = await db.selectDistinctOn([CardEntityView.cardId], {
            cardId: CardEntityView.cardId,
        })
            .from(CardEntityView)
            .where(and(
                eq(CardEntityView.type, 'hero'),
                eq(CardEntityView.collectible, true),
                gt(CardEntityView.cost, 0),
                notInArray(CardEntityView.cardId, ['EX1_323', 'CORE_EX1_323']),
            ))
            .then(rows => rows.map(r => r.cardId));

        this.groups.quest = await db.selectDistinctOn([CardEntityView.cardId], {
            cardId: CardEntityView.cardId,
        })
            .from(CardEntityView)
            .where(and(
                inArray(CardEntityView.questType, ['normal', 'questline']),
                eq(CardEntityView.collectible, true),
            ))
            .then(rows => rows.map(r => r.cardId));
    }

    private async loadCard(): Promise<void> {
        const cards: string[] = [];

        for (const k of Object.keys(this.groups)) {
            cards.push(...this.groups[k]);
        }

        for (const a of this.announcements) {
            if (a.cardId != null && !cards.includes(a.cardId)) {
                cards.push(a.cardId);
            }
        }

        this.cards = await db.select({
            cardId:  CardEntityView.cardId,
            version: CardEntityView.version,
            set:     CardEntityView.set,
        })
            .from(CardEntityView)
            .where(inArray(CardEntityView.cardId, cards))
            .then(cards => cards.map(c => ({
                cardId:  c.cardId,
                version: c.version,
                sets:    [c.set],
            })));
    }

    private getCardList(group: string): string[] {
        return this.groups[group] ?? [];
    }

    private detectGroup(group: string, format: string, sets?: string[]): string[] {
        return this.getCardList(group).filter(c => {
            const data = this.cards.find(d => d.cardId === c);

            if (data == null) {
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
        score: number | null,
        format: string,
        options: {
            source:        string;
            date:          string;
            name:          string;
            effectiveDate: string;
            link:          string[];
            version:       number;
            lastVersion:   number | null;
        },
    ): void {
        const { source, date, name, effectiveDate, link, version, lastVersion } = options;

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
            version,
            lastVersion,

            type: 'set_change',
            format,

            setId,

            status,
            score,
        });

        this.formatChanges.push({
            source,
            date,
            effectiveDate,
            name,
            link,
            version,
            lastVersion,

            type: 'set_change',
            format,

            cardId: null,
            setId,
            ruleId: null,
            group:  null,

            status,
            score,

            adjustment:   null,
            relatedCards: null,
        });

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
        score: number | null,
        format: string,
        options: {
            group:         string | undefined;
            source:        string;
            date:          string;
            name:          string;
            effectiveDate: string;
            link:          string[];
            version:       number;
            lastVersion:   number | null;
            relatedCards:  string[] | null;
        },
    ): void {
        const { group, source, date, name, effectiveDate, link, version, lastVersion, relatedCards } = options;

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
            version,
            lastVersion,

            type: 'card_change',
            format,

            cardId,
            setId: null,
            group: group ?? null,

            status,
            score,

            adjustment: null,
        });

        this.formatChanges.push({
            source,
            date,
            effectiveDate,
            name,
            link,
            version,
            lastVersion,

            type: 'card_change',
            format,

            cardId,
            setId:  null,
            ruleId: null,
            group:  group ?? null,

            status,
            score,

            adjustment: null,
            relatedCards,
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
                    score,
                    date,
                    group: group ?? null,
                });
            } else {
                b.status = status;
                b.score = score;
                b.date = date;
                b.group = group ?? null;
            }
        }
    }

    async apply(): Promise<void> {
        log.info('============= Applying Hearthstone banlist... =============');

        await this.initialize();
        await this.loadCard();

        log.info('Loaded Hearthstone banlist data');

        this.formatChanges = [];
        this.setChanges = [];
        this.cardChanges = [];

        this.groupWatcher = [];

        for (const f of Object.values(this.formatMap)) {
            f.sets = [];
            f.banlist = [];
        }

        await db.delete(CardChange);
        await db.delete(SetChange);
        await db.delete(FormatChange);

        const allAnnouncements = this.announcements.sort((a, b) => cmp(a.date, b.date));

        for (const a of allAnnouncements) {
            const effectiveDate = a.effectiveDate ?? a.date;

            const formats = (() => {
                switch (a.format) {
                case '#hearthstone': {
                    const targetFormats = a.type === 'set_change'
                        ? ['standard', 'wild']
                        : ['standard', 'wild', 'arena', 'duel', 'twist'];

                    return targetFormats.filter(f => {
                        const format = this.formatMap[f]!;
                        // the change don't become effective now
                        if (effectiveDate > new Date().toISOString().split('T')[0]) { return false; }
                        // the change is before the format exists
                        if (format.birthday != null && effectiveDate < format.birthday) { return false; }
                        // the change is after the format died
                        if (format.deathdate != null && effectiveDate > format.deathdate) { return false; }
                        return true;
                    });
                }
                default:
                    return a.format == null ? [] : [a.format];
                }
            })();

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
                            console.log(fo.sets);

                            throw new Error(`In set ${a.setId} is already in ${f}, date: ${a.date}`);
                        }
                    } else if (a.status === 'unavailable') {
                        if (!fo.sets.includes(a.setId!)) {
                            throw new Error(`Out set ${a.setId} is not in ${f}, date: ${a.date}`);
                        }
                    } else {
                        throw new Error(`Invalid status ${a.status} for set ${a.setId} in format ${f}`);
                    }

                    this.setChange(a.setId!, a.status!, a.score, f, {
                        source:      a.source,
                        date:        a.date,
                        name:        a.name,
                        effectiveDate,
                        link:        a.link,
                        version:     a.version,
                        lastVersion: a.lastVersion,
                    });

                    if (a.status === 'legal') {
                        for (const g of this.groupWatcher.filter(g => g.format === f)) {
                            const detectedCards = this.detectGroup(g.groupId, f, [a.setId]);

                            const cards = detectedCards.filter(
                                c => !fo.banlist.some(b => b.cardId === c && b.status === g.status),
                            );

                            for (const v of cards) {
                                this.cardChange(v, g.status, g.score, f, {
                                    group:         g.groupId,
                                    source:        g.source,
                                    date:          effectiveDate,
                                    name:          g.name,
                                    effectiveDate: effectiveDate,
                                    link:          g.link,
                                    version:       a.version,
                                    lastVersion:   a.lastVersion,
                                    relatedCards:  a.relatedCards,
                                });
                            }
                        }
                    } else if (a.status === 'unavailable') {
                        for (const b of fo.banlist) {
                            const sets = this.cards.find(c => c.cardId === b.cardId)?.sets ?? [];

                            const setInFormat = sets.filter(s => [...fo.sets ?? [], a.setId]!.includes(s));

                            if (setInFormat.every(s => s === a.setId)) {
                                this.cardChange(b.cardId, 'unavailable', null, f, {
                                    group:        b.group ?? undefined,
                                    source:       a.source,
                                    date:         a.date,
                                    name:         a.name,
                                    effectiveDate,
                                    link:         a.link,
                                    version:      a.version,
                                    lastVersion:  a.lastVersion,
                                    relatedCards: a.relatedCards,
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

                        const newChanges: { cardId: string, status: Legality, score: number | null, group: string | null }[] = [];

                        for (const f of srcFormats) {
                            for (const bo of this.formatMap[f].banlist) {
                                if (!fo.banlist.some(bf => bf.cardId === bo.cardId)) {
                                    newChanges.push({
                                        cardId: bo.cardId,
                                        status: a.status ?? bo.status,
                                        score:  a.score ?? bo.score ?? null,
                                        group:  bo.group,
                                    });
                                }
                            }
                        }

                        newChanges.sort((a, b) => cmp(a.cardId, b.cardId));

                        for (const n of newChanges) {
                            this.cardChange(n.cardId, n.status, n.score, f, {
                                group:        n.group ?? undefined,
                                source:       a.source,
                                date:         a.date,
                                name:         a.name,
                                effectiveDate,
                                link:         a.link,
                                version:      a.version,
                                lastVersion:  a.lastVersion,
                                relatedCards: a.relatedCards,
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
                                    score:   a.score,
                                });
                            } else {
                                this.groupWatcher[index].source = a.source;
                                this.groupWatcher[index].link = a.link;
                                this.groupWatcher[index].name = a.name;
                                this.groupWatcher[index].status = a.status;
                                this.groupWatcher[index].score = a.score;
                            }

                            const cards = this.detectGroup(group, f, fo.sets);

                            for (const v of cards) {
                                this.cardChange(v, a.status, a.score, f, {
                                    group:        group ?? null,
                                    source:       a.source,
                                    date:         effectiveDate,
                                    name:         a.name,
                                    effectiveDate,
                                    link:         a.link,
                                    version:      a.version,
                                    lastVersion:  a.lastVersion,
                                    relatedCards: a.relatedCards,
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
                                this.cardChange(v, a.status, a.score, f, {
                                    group,
                                    source:       a.source,
                                    date:         effectiveDate,
                                    name:         a.name,
                                    effectiveDate,
                                    link:         a.link,
                                    version:      a.version,
                                    lastVersion:  a.lastVersion,
                                    relatedCards: a.relatedCards,
                                });
                            }
                        }
                    } else {
                        this.cardChange(a.cardId, a.status, a.score, f, {
                            group:        undefined,
                            source:       a.source,
                            date:         a.date,
                            name:         a.name,
                            effectiveDate,
                            link:         a.link,
                            version:      a.version,
                            lastVersion:  a.lastVersion,
                            relatedCards: a.relatedCards,
                        });
                    }
                } else if (a.type === 'rule_change') {
                    this.formatChanges.push({
                        source:        a.source,
                        date:          a.date,
                        effectiveDate: a.effectiveDate,
                        name:          a.name,
                        link:          a.link,
                        version:       a.version,
                        lastVersion:   a.lastVersion,

                        type:   'rule_change',
                        format: a.format,

                        cardId: a.cardId,
                        setId:  a.setId,
                        ruleId: a.ruleId,
                        group:  null,

                        status: a.status,
                        score:  a.score,

                        adjustment:   null,
                        relatedCards: null,
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
