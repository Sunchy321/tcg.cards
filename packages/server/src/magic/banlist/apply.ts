import Format from '../db/format';
import FormatAnnouncement from '../db/format-announcement';
import FormatChange from '@/magic/db/format-change';
import Set from '@/magic/db/set';
import Card from '@/magic/db/card';

import { Document } from 'mongoose';

import { Card as ICard } from '@interface/magic/card';
import { Format as IFormat } from '@interface/magic/format';
import {
    FormatAnnouncement as IFormatAnnouncement,
    FormatChange as IFormatChange,
    Legality,
} from '@interface/magic/format-change';

import { cloneDeep } from 'lodash';
import internalData from '@/internal-data';
import { toIdentifier } from '@common/util/id';

import { banlistStatusOrder, banlistSourceOrder } from '@static/magic/misc';

const formatWithSet = [
    'standard', 'pioneer', 'modern', 'extended',
    'alchemy', 'historic', 'explorer', 'timeless',
];

function cmp<T>(a: T, b: T): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

export class AnnouncementApplier {
    private announcements: IFormatAnnouncement[];

    private formatMap: Record<string, Document & IFormat>;
    private eternalFormats: string[];

    private sets: { id: string, releaseDate: string }[];

    private anteList: string[];
    private conspiracyList: string[];
    private legendaryList: string[];
    private unfinityList: string[];
    private offensiveList: string[];

    private cards: {
        cardId: string;
        sets: string[];
        inPauper: boolean;
        inPauperCommander: boolean;
    }[];

    private changes: IFormatChange[];

    private groupWatcher: {
        source: string;
        link?: string[];
        format: string;
        id: string;
        status: Legality;
    }[];

    private async initialize(): Promise<void> {
        // load announcements
        const announcements = await FormatAnnouncement.find();

        this.announcements = announcements.map(a => a.toJSON());

        // load formats
        const formats = await Format.find();

        this.formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));
        this.eternalFormats = formats.filter(f => f.isEternal).map(f => f.formatId);

        // load sets
        const sets = await Set.find({ setType: { $in: ['core', 'expansion', 'draft_innovation', 'funny', 'alchemy', 'commander'] } });

        this.sets = sets.map(s => ({ id: s.setId, releaseDate: s.releaseDate! }));

        // preload group cards
        this.anteList = internalData<string[]>('magic.banlist.ante').map(toIdentifier);
        this.offensiveList = internalData<string[]>('magic.banlist.offensive').map(toIdentifier);
        this.unfinityList = internalData<string[]>('magic.banlist.unfinity').map(toIdentifier);

        // all conspiracy
        this.conspiracyList = await Card.distinct('cardId', { 'parts.type.main': 'conspiracy' });

        // legendary cards are legal after 1995-11-01
        const result = await Card.aggregate<ICard>()
            .match({ 'parts.type.super': 'legendary' })
            .lookup({
                from:         'prints',
                localField:   'cardId',
                foreignField: 'cardId',
                as:           'prints',
            })
            .match({ 'prints.releaseDate': { $lte: '1995-11-01' } });

        this.legendaryList = result.map(v => v.cardId);
    }

    private async loadCard(): Promise<void> {
        const cards: string[] = [];

        cards.push(...this.anteList);
        cards.push(...this.conspiracyList);
        cards.push(...this.offensiveList);
        cards.push(...this.unfinityList);
        cards.push(...this.legendaryList);

        for (const a of this.announcements) {
            for (const c of a.changes) {
                if (c.banlist == null) {
                    continue;
                }

                for (const b of c.banlist) {
                    if (!cards.includes(b.id)) {
                        cards.push(b.id);
                    }
                }
            }
        }

        const data = await Card.aggregate<{
            cardId: string;
            typeMain: string[][];
            sets: string[];
            rarity: string[];
        }>()
            .match({ cardId: { $in: cards } })
            .lookup({
                from:     'prints',
                let:      { cardId: '$cardId' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$cardId', '$$cardId'] } } },
                    {
                        $group: {
                            _id:    '$cardId',
                            sets:   { $addToSet: '$set' },
                            rarity: { $addToSet: '$rarity' },
                        },
                    },
                ],
                as: 'prints',
            })
            .unwind('prints')
            .project({
                _id:      false,
                cardId:   '$cardId',
                typeMain: '$parts.type.main',
                sets:     '$prints.sets',
                rarity:   '$prints.rarity',
            });

        this.cards = data.map(d => ({
            cardId:   d.cardId,
            sets:     d.sets,
            inPauper: d.rarity.includes('common'),

            // rough code, ignore background
            inPauperCommander:
                d.typeMain[0].includes('creature')
                    ? (d.rarity.includes('common') || d.rarity.includes('uncommon'))
                    : d.rarity.includes('common'),
        }));
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
        set: string,
        status: 'in' | 'out',
        format: string,
        source: string,
        date: string,
        link: string[] | undefined,
    ): void {
        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        if (!f.isEternal) {
            this.changes.push({
                source, date, format, link, type: 'set', id: set, status,
            });
        }

        if (f.sets == null) {
            f.sets = [];
        }

        if (status === 'in') {
            f.sets.push(set);
        } else {
            f.sets = f.sets.filter(s => s !== set);
        }
    }

    private cardChange(
        card: string,
        status: Legality,
        format: string,
        group: string | undefined,
        source: string,
        date: string,
        link: string[] | undefined,
    ): void {
        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        this.changes.push({
            source, date, format, link, type: 'card', id: card, status, group,
        });

        if (f.banlist == null) {
            f.banlist = [];
        }

        if (['legal', 'unavailable'].includes(status)) {
            f.banlist = f.banlist.filter(v => v.id !== card);
        } else {
            const b = f.banlist.find(v => v.id === card);

            if (b == null) {
                f.banlist.push({
                    id: card, status, date, group,
                });
            } else {
                b.status = status;
                b.date = date;
                b.group = group;
            }
        }
    }

    async apply(): Promise<void> {
        await this.initialize();
        await this.loadCard();

        this.changes = [];
        this.groupWatcher = [];

        const alchemyBirthday = this.formatMap.alchemy.birthday!;
        const standardBrawlBirthday = this.formatMap.standard_brawl.birthday!;

        for (const f of Object.values(this.formatMap)) {
            f.sets = [];
            f.banlist = [];
        }

        await FormatChange.deleteMany();

        const pseudoReleaseAnnouncement = this.sets.filter(
            s => !this.announcements.some(
                a => a.changes.some(
                    c => c.format === '#standard' && c.setIn?.includes(s.id),
                ),
            ),
        ).map(s => ({
            source:  'release',
            date:    s.releaseDate,
            changes: [{ format: '#eternal', setIn: [s.id] }],
        } as IFormatAnnouncement));

        const pseudoInitialAnnouncement = Object.values(this.formatMap)
            .filter(f => f.isEternal && f.birthday != null)
            .map(f => ({
                source:  'initial',
                date:    f.birthday!,
                changes: [{
                    format: f.formatId,
                    setIn:  this.sets.filter(s => s.releaseDate < f.birthday!).map(s => s.id),
                }],
            }) as IFormatAnnouncement);

        const allAnnouncements = [
            ...this.announcements,
            ...pseudoReleaseAnnouncement,
            ...pseudoInitialAnnouncement,
        ].sort((a, b) => cmp(a.date, b.date));

        for (const a of allAnnouncements) {
            const date = a.effectiveDate?.tabletop ?? a.effectiveDate?.online ?? a.effectiveDate?.arena ?? a.date;

            const changes: Required<IFormatAnnouncement['changes'][0]>[] = [];

            // expand format group #standard and #eternal
            for (const c of a.changes) {
                if (c.banlist != null && c.format.startsWith('#')) {
                    throw new Error(`Banlist is incompatible with format group ${c.format}`);
                }

                const formats = (() => {
                    switch (c.format) {
                    case '#alchemy':
                        return ['alchemy', 'historic', 'timeless'].filter(f => {
                            const format = this.formatMap[f]!;
                            // the change don't become effective now
                            if (date > new Date().toISOString().split('T')[0]) { return false; }
                            // the change is before the format exists
                            if (format.birthday != null && date < format.birthday) { return false; }
                            // the change is after the format died
                            if (format.deathdate != null && date > format.deathdate) { return false; }
                            return true;
                        });
                    case '#standard':
                        return [...this.eternalFormats, ...formatWithSet].filter(f => {
                            const format = this.formatMap[f]!;
                            // the change don't become effective now
                            if (date > new Date().toISOString().split('T')[0]) { return false; }
                            // the change is before the format exists
                            if (format.birthday != null && date < format.birthday) { return false; }
                            // the change is after the format died
                            if (format.deathdate != null && date > format.deathdate) { return false; }
                            return true;
                        });
                    case '#eternal':
                        return [...this.eternalFormats].filter(f => {
                            const format = this.formatMap[f]!;
                            // the change don't become effective now
                            if (date > new Date().toISOString().split('T')[0]) { return false; }
                            // the change is before the format exists
                            if (format.birthday != null && date < format.birthday) { return false; }
                            // the change is after the format died
                            if (format.deathdate != null && date > format.deathdate) { return false; }
                            return true;
                        });
                    default:
                        return [c.format];
                    }
                })();

                if (formats.includes('standard')) {
                    if (!formats.includes('standard_brawl') && date >= standardBrawlBirthday) {
                        formats.push('standard_brawl');
                    }
                }

                if (formats.includes('historic')) {
                    if (!formats.includes('brawl')) {
                        formats.push('brawl');
                    }
                }

                for (const f of formats) {
                    const co = changes.find(v => v.format === f);

                    if (co == null) {
                        changes.push({
                            format:  f,
                            setIn:   cloneDeep(c.setIn ?? []),
                            setOut:  cloneDeep(c.setOut ?? []),
                            banlist: [],
                        });
                    } else {
                        co.setIn.push(...cloneDeep(c.setIn ?? []));
                        co.setOut.push(...cloneDeep(c.setOut ?? []));
                    }
                }

                if (c.banlist != null && c.banlist.length > 0) {
                    const co = changes.find(v => v.format === c.format)!;

                    if (co == null) {
                        changes.push({
                            format:  c.format,
                            setIn:   cloneDeep(c.setIn ?? []),
                            setOut:  cloneDeep(c.setOut ?? []),
                            banlist: cloneDeep(c.banlist ?? []),
                        });
                    } else {
                        co.banlist.push(...cloneDeep(c.banlist ?? []));
                    }
                }
            }

            // apply changes
            for (const c of changes) {
                const fo = this.formatMap[c.format];

                if (fo == null) {
                    continue;
                }

                if (fo.sets == null) {
                    fo.sets = [];
                }

                // sets in
                for (const s of c.setIn) {
                    if (fo.sets.includes(s)) {
                        // Alchemy initial, ignore duplicate
                        if (['historic', 'brawl'].includes(fo.formatId) && a.date === alchemyBirthday) {
                            continue;
                        }

                        throw new Error(`In set ${s} is already in ${c.format}, date: ${a.date}`);
                    }

                    this.setChange(s, 'in', c.format, a.source, date, a.link);
                }

                // sets out
                for (const s of c.setOut) {
                    if (fo.sets == null || !fo.sets.includes(s)) {
                        throw new Error(`Out set ${s} is not in ${c.format}, date: ${a.date}`);
                    }

                    this.setChange(s, 'out', c.format, a.source, date, a.link);
                }

                // banlist changes
                for (const b of c.banlist) {
                    const banlistDate = b.effectiveDate ?? date;

                    if (b.id.startsWith('#{clone')) {
                        // clones from other format
                        const srcFormats = /^#\{clone:(.*)\}/.exec(b.id)![1].split(',');

                        const newChanges: { id: string, status: Legality, group?: string }[] = [];

                        for (const f of srcFormats) {
                            for (const bo of this.formatMap[f].banlist) {
                                if (!fo.banlist.some(bf => bf.id === bo.id)) {
                                    newChanges.push({
                                        id:     bo.id,
                                        status: b.status ?? bo.status,
                                        group:  bo.group,
                                    });
                                }
                            }
                        }

                        newChanges.sort((a, b) => cmp(a.id, b.id));

                        for (const n of newChanges) {
                            this.cardChange(n.id, n.status, c.format, n.group, a.source, banlistDate, a.link);
                        }
                    } else if (b.id.startsWith('#')) {
                        // card banned as a group
                        const group = b.id.slice(1);

                        if (!['legal', 'unavailable'].includes(b.status)) {
                            const index = this.groupWatcher.findIndex(g => g.id === group && g.format === c.format);

                            if (index === -1) {
                                this.groupWatcher.push({
                                    source: a.source,
                                    link:   a.link,
                                    id:     group,
                                    format: c.format,
                                    status: b.status,
                                });
                            } else {
                                this.groupWatcher[index].source = a.source;
                                this.groupWatcher[index].link = a.link;
                                this.groupWatcher[index].status = b.status;
                            }

                            const cards = this.detectGroup(group, c.format, fo.sets);

                            for (const v of cards) {
                                this.cardChange(v, b.status, c.format, group, a.source, banlistDate, a.link);
                            }
                        } else {
                            const index = this.groupWatcher.findIndex(g => g.id === group && g.format === c.format);

                            if (index === -1) {
                                throw new Error(`Out group ${group} is not in ${c.format}, date: ${a.date}`);
                            }

                            this.groupWatcher.splice(index, 1);

                            const cardsRemoved = fo.banlist.filter(v => v.group === group).map(v => v.id);

                            for (const v of cardsRemoved) {
                                this.cardChange(v, b.status, c.format, group, a.source, banlistDate, a.link);
                            }
                        }
                    } else {
                        this.cardChange(b.id, b.status, c.format, undefined, a.source, banlistDate, a.link);
                    }
                }

                // banlist item enters by group
                if (c.setIn != null && c.setIn.length > 0) {
                    for (const g of this.groupWatcher.filter(g => g.format === c.format)) {
                        const detectedCards = this.detectGroup(g.id, c.format, c.setIn);

                        const cards = detectedCards.filter(
                            c => !fo.banlist.some(b => b.id === c && b.status === g.status),
                        );

                        for (const v of cards) {
                            this.cardChange(v, g.status, c.format, g.id, g.source, date, g.link);
                        }
                    }
                }

                // banlist item rotated out
                if (c.setOut != null && c.setOut.length > 0) {
                    for (const b of fo.banlist) {
                        const sets = this.cards.find(c => c.cardId === b.id)?.sets ?? [];

                        const setInFormat = sets.filter(s => [...fo.sets ?? [], c.setOut]!.includes(s));

                        if (setInFormat.every(s => c.setOut!.includes(s))) {
                            this.cardChange(b.id, 'unavailable', c.format, b.group, a.source, date, a.link);
                        }
                    }
                }
            }
        }

        await FormatChange.insertMany(this.changes);

        for (const format of Object.values(this.formatMap)) {
            if (format.isEternal || format.sets?.length === 0) {
                format.sets = undefined;
            }

            format.banlist.sort((a, b) => {
                if (a.status !== b.status) {
                    return banlistStatusOrder.indexOf(a.status)
                    - banlistStatusOrder.indexOf(b.status);
                } else if (a.group !== b.group) {
                    return banlistSourceOrder.indexOf(a.group ?? null)
                    - banlistSourceOrder.indexOf(b.group ?? null);
                } else {
                    return cmp(a.id, b.id);
                }
            });

            await format.save();
        }
    }
}
