import Format from '../db/format';
import FormatAnnouncement from '../db/format-announcement';
import FormatChange from '@/hearthstone/db/format-change';
import Set from '@/hearthstone/db/set';
import Entity from '@/hearthstone/db/entity';

import { Document } from 'mongoose';

import { Format as IFormat } from '@interface/hearthstone/format';
import {
    FormatAnnouncement as IFormatAnnouncement,
    FormatChange as IFormatChange,
    Legality, Adjustment,
} from '@interface/hearthstone/format-change';

import { cloneDeep } from 'lodash';

const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'banned_as_companion', 'restricted', 'legal', 'unavailable'];
const banlistSourceOrder = ['ante', 'offensive', 'conspiracy', 'legendary', null];

function cmp<T>(a: T, b: T): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

type IntermediateChange = {
    format:         string;
    effectiveDate?: string;
    setIn:          string[];
    setOut:         string[];
    banlist:        { id: string, status: Legality }[];
    adjustment: {
        id:         string;
        status:     Adjustment;
        adjustment: {
            id?:    string;
            detail: { part: string, status: Adjustment }[];
        }[];
    }[];
};

function combineStatus(status: Adjustment[]) {
    if (status.some(s => s === 'adjust')) {
        return 'adjust';
    }

    if (status.every(s => s === 'buff')) {
        return 'buff';
    }

    if (status.every(s => s === 'nerf')) {
        return 'nerf';
    }

    return 'adjust';
}

function transformAdjustment(adjustment: Required<IFormatAnnouncement['changes'][0]>['adjustment']): IntermediateChange['adjustment'] {
    const entities: string[] = [];

    for (const a of adjustment) {
        for (const e of a.related ?? [a.id]) {
            if (!entities.includes(e)) {
                entities.push(e);
            }
        }
    }

    const result: IntermediateChange['adjustment'] = [];

    for (const e of entities) {
        const items = adjustment.filter(a => a.id === e || a.related?.includes(e));

        const mainItem = items.find(a => a.id === e);

        const status = mainItem != null
            ? mainItem.status
            : combineStatus(items.map(v => v.status));

        const adjustItems = items.map(v => {
            if (v.id === e) {
                return { detail: v.detail };
            } else {
                return { id: v.id, detail: v.detail };
            }
        });

        result.push({
            id:         e,
            status,
            adjustment: adjustItems,
        });
    }

    return result;
}

export class AnnouncementApplier {
    private announcements: IFormatAnnouncement[];

    private formatMap: Record<string, Document & IFormat>;

    private sets: { id: string, releaseDate: string }[];

    private entities: Record<string, string[]> = {
        c_thun: [
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
        odd_even: [
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
        id:      string;
        version: number[];
        set:     string;
    }[];

    private changes: IFormatChange[];

    private groupWatcher: {
        source: string;
        link?:  string[];
        format: string;
        id:     string;
        status: Legality;
    }[];

    private async initialize(): Promise<void> {
        // load announcements
        const announcements = await FormatAnnouncement.find();

        this.announcements = announcements.map(a => a.toJSON());

        // load formats
        const formats = await Format.find();

        this.formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));

        // load sets
        const sets = await Set.find({ });

        this.sets = sets.map(s => ({ id: s.setId, releaseDate: s.releaseDate! }));

        // preload group entities
        this.entities.hero = await Entity.distinct('cardId', {
            type:        'hero',
            collectible: true,
            cost:        { $gt: 0 },
            cardId:      { $nin: ['EX1_323', 'CORE_EX1_323'] },
        });

        this.entities.quest = await Entity.distinct('cardId', {
            'quest.type':  { $in: ['normal', 'questline'] },
            'collectible': true,
        });
    }

    private async loadCard(): Promise<void> {
        const cards: string[] = [];

        for (const k of Object.keys(this.entities)) {
            cards.push(...this.entities[k]);
        }

        for (const a of this.announcements) {
            for (const c of a.changes) {
                if (c.banlist != null) {
                    for (const b of c.banlist) {
                        if (!cards.includes(b.id)) {
                            cards.push(b.id);
                        }
                    }
                }

                if (c.adjustment != null) {
                    for (const j of c.adjustment) {
                        if (!cards.includes(j.id)) {
                            cards.push(j.id);
                        }

                        if (j.related != null) {
                            for (const r of j.related) {
                                if (!cards.includes(r)) {
                                    cards.push(r);
                                }
                            }
                        }
                    }
                }
            }
        }

        const data = await Entity.aggregate<{
            cardId:  string;
            version: number[];
            set:     string;
        }>()
            .match({ cardId: { $in: cards } })
            .project({
                _id: 0, cardId: 1, version: 1, set: 1,
            });

        this.cards = data.map(d => ({
            id:      d.cardId,
            version: d.version,
            set:     d.set,
        }));
    }

    private getCardData(id: string, version: number) {
        const allData = this.cards.filter(c => c.id === id);

        const data = allData.find(c => c.version.includes(version)) ?? allData[0];

        if (data == null) {
            throw new Error(`Unknown card ${id}`);
        }

        return data;
    }

    private getCardList(group: string): string[] {
        return this.entities[group];
    }

    private detectGroup(group: string, format: string, sets?: string[]): string[] {
        return this.getCardList(group).filter(c => {
            const data = this.cards.find(d => d.id === c);

            if (data == null) {
                return false;
            }

            if (sets == null) {
                return true;
            } else {
                return sets.includes(data.set);
            }
        });
    }

    private setChange(
        set: string,
        status: 'in' | 'out',
        format: string,
        source: string,
        date: string,
        name: string,
        link: string[] | undefined,
        version: number,
        lastVersion: number | undefined,
    ): void {
        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        this.changes.push({
            source, date, name, format, link, type: 'set', id: set, status, version, lastVersion,
        });

        if (f.sets == null) {
            f.sets = [];
        }

        if (status === 'in') {
            f.sets.push(set);
        } else {
            f.sets = f.sets.filter(s => s !== set);
        }
    }

    private banlistChange(
        card: string,
        status: Legality,
        format: string,
        group: string | undefined,
        source: string,
        date: string,
        name: string,
        link: string[] | undefined,
        version: number,
        lastVersion: number | undefined,
    ): void {
        const f = this.formatMap[format];

        if (f == null) {
            return;
        }

        const realGroup = group != null && /^\[.*\]$/.test(group) ? undefined : group;

        this.changes.push({
            source, date, name, format, link, type: 'banlist', id: card, status, group: realGroup, version, lastVersion,
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
                    id: card, status, date, group: realGroup,
                });
            } else {
                b.status = status;
                b.date = date;
                b.group = realGroup;
            }
        }
    }

    async apply(): Promise<void> {
        await this.initialize();
        await this.loadCard();

        this.changes = [];
        this.groupWatcher = [];

        for (const f of Object.values(this.formatMap)) {
            f.sets = [];
            f.banlist = [];
        }

        await FormatChange.deleteMany();

        const allAnnouncements = this.announcements.sort((a, b) => cmp(a.date, b.date));

        for (const a of allAnnouncements) {
            const baseDate = a.effectiveDate ?? a.date;

            const changes: IntermediateChange[] = [];

            const sortChanges = a.changes
                .sort((a, b) => Number(a.format.startsWith('#')) - Number(b.format.startsWith('#')));

            // expand format group #standard
            for (const c of sortChanges) {
                const date = c.effectiveDate ?? baseDate;

                const formats = (() => {
                    switch (c.format) {
                    case '#hearthstone':
                        return ['standard', 'wild', 'arena', 'duel', 'twist'].filter(f => {
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

                for (const f of formats) {
                    const co = changes.find(v => v.format === f && v.effectiveDate === c.effectiveDate);

                    const fo = this.formatMap[f]!;

                    const adjustment = transformAdjustment(c.adjustment ?? [])
                        .filter(j => !c.format.startsWith('#')
                          || j.id === 'HERO_02bp' // Shaman basic hero power
                          || fo.sets?.includes(this.getCardData(j.id, a.version).set));

                    if (co == null) {
                        const change = {
                            format:        f,
                            effectiveDate: c.effectiveDate,
                            setIn:         [] as string[],
                            setOut:        [] as string[],
                            banlist:       cloneDeep(c.banlist ?? []),
                            adjustment,
                        };

                        if (c.format !== '#hearthstone' || ['standard', 'wild'].includes(f)) {
                            change.setIn = cloneDeep(c.setIn ?? []);
                            change.setOut = cloneDeep(c.setOut ?? []);
                        }

                        changes.push(change);
                    } else {
                        if (c.format !== '#hearthstone' || ['standard', 'wild'].includes(f)) {
                            co.setIn.push(...cloneDeep(c.setIn ?? []));
                            co.setOut.push(...cloneDeep(c.setOut ?? []));
                        }

                        co.banlist.push(...cloneDeep(c.banlist ?? []));
                        co.adjustment.push(...adjustment);
                    }
                }
            }

            changes.sort((a, b) => cmp(a.effectiveDate ?? baseDate, b.effectiveDate ?? baseDate));

            // apply changes
            for (const c of changes) {
                const date = c.effectiveDate ?? baseDate;

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
                        throw new Error(`In set ${s} is already in ${c.format}, date: ${a.date}`);
                    }

                    this.setChange(s, 'in', c.format, a.source, date, a.name, a.link, a.version, a.lastVersion);
                }

                // sets out
                for (const s of c.setOut) {
                    if (fo.sets == null || !fo.sets.includes(s)) {
                        throw new Error(`Out set ${s} is not in ${c.format}, date: ${a.date}`);
                    }

                    this.setChange(s, 'out', c.format, a.source, date, a.name, a.link, a.version, a.lastVersion);
                }

                // banlist changes
                for (const b of c.banlist) {
                    const banlistDate = date;

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
                            this.banlistChange(
                                n.id,
                                n.status,
                                c.format,
                                n.group,
                                a.source,
                                banlistDate,
                                a.name,
                                a.link,
                                a.version,
                                a.lastVersion,
                            );
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
                                this.banlistChange(
                                    v,
                                    b.status,
                                    c.format,
                                    group,
                                    a.source,
                                    banlistDate,
                                    a.name,
                                    a.link,
                                    a.version,
                                    a.lastVersion,
                                );
                            }
                        } else {
                            const index = this.groupWatcher.findIndex(g => g.id === group && g.format === c.format);

                            if (index === -1) {
                                throw new Error(`Out group ${group} is not in ${c.format}, date: ${a.date}`);
                            }

                            this.groupWatcher.splice(index, 1);

                            const cardsRemoved = fo.banlist.filter(v => v.group === group).map(v => v.id);

                            for (const v of cardsRemoved) {
                                this.banlistChange(
                                    v,
                                    b.status,
                                    c.format,
                                    group,
                                    a.source,
                                    banlistDate,
                                    a.name,
                                    a.link,
                                    a.version,
                                    a.lastVersion,
                                );
                            }
                        }
                    } else {
                        this.banlistChange(
                            b.id,
                            b.status,
                            c.format,
                            undefined,
                            a.source,
                            banlistDate,
                            a.name,
                            a.link,
                            a.version,
                            a.lastVersion,
                        );
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
                            this.banlistChange(
                                v,
                                g.status,
                                c.format,
                                g.id,
                                g.source,
                                date,
                                a.name,
                                g.link,
                                a.version,
                                a.lastVersion,
                            );
                        }
                    }
                }

                // banlist item rotated out
                // arena has too many rotates so its banlist won't rotate out
                if (c.setOut != null && c.setOut.length > 0 && c.format !== 'arena') {
                    for (const b of fo.banlist) {
                        if (c.setOut.includes(this.getCardData(b.id, a.version).set)) {
                            this.banlistChange(b.id, 'unavailable', c.format, b.group, a.source, date, a.name, a.link, a.version, a.lastVersion);
                        }
                    }
                }

                // adjustment
                for (const j of c.adjustment) {
                    this.changes.push({
                        source:      a.source,
                        date,
                        name:        a.name,
                        format:      c.format,
                        link:        a.link,
                        version:     a.version,
                        lastVersion: a.lastVersion,
                        type:        'adjustment',
                        id:          j.id,
                        status:      j.status,
                        adjustment:  j.adjustment,
                    });
                }
            }
        }

        await FormatChange.insertMany(this.changes);

        for (const format of Object.values(this.formatMap)) {
            if (format.sets?.length === 0) {
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
