import git, { ResetMode } from 'simple-git';

import { XCardDefs, XLocStringTag, XTag } from '@interface/hearthstone/hsdata/xml';

import Card from '@/hearthstone/db/card';
import Entity from '@/hearthstone/db/entity';
import CardRelation from '@/hearthstone/db/card-relation';
import Task from '@/common/task';

import { db } from '@/drizzle';
import { Patch } from '@/hearthstone/schema/patch';

import { eq } from 'drizzle-orm';

import { Entity as IEntity } from '@interface/hearthstone/entity';
import { CardRelation as ICardRelation } from '@interface/hearthstone/card-relation';

import * as fs from 'fs';
import * as path from 'path';
import { xml2js } from 'xml-js';
import { intersection, isEqual, last, omit, uniq } from 'lodash';

import {
    TextBuilderType, getLangStrings, getDbfCardFile, getDisplayText,
} from '@/hearthstone/blizzard/display-text';

import { localPath, langMap } from './base';

import { toBucket, toGenerator } from '@/common/to-bucket';
import internalData from '@/internal-data';
import { loadPatch } from '@/hearthstone/logger';
import { parseEntity } from './parse';

function hasData(): boolean {
    return fs.existsSync(path.join(localPath, '.git'));
}

export interface ITag {
    index:   keyof IEntity | 'multiClass';
    bool?:   true;
    array?:  true;
    enum?:   string | true;
    static?: IEntity[keyof IEntity];
}

export interface ILoadPatchStatus {
    type:    'load-patch';
    version: number;
    count:   number;
    total:   number;
}

export class PatchLoader extends Task<ILoadPatchStatus> {
    buildNumber: number;

    data: Record<string, any> = { };

    constructor(version: number) {
        super();
        this.buildNumber = version;
    }

    private addData(name: string) {
        this.data[name] = internalData(`hearthstone.${name}`);
    }

    private getMapData<T>(name: string): Record<string, T> {
        if (this.data[`tag.map.${name}`] == null) {
            this.addData(`tag.map.${name}`);
        }

        return this.data[`tag.map.${name}`];
    }

    private getSpecialData<T>(name: string): T {
        if (this.data[`tag.${name}`] == null) {
            this.addData(`tag.${name}`);
        }

        return this.data[`tag.${name}`];
    }

    private getValue(tag: XLocStringTag | XTag, info: ITag) {
        if (tag._attributes.type === 'LocString') {
            return Object.entries(tag)
                .filter(v => v[0] !== '_attributes')
                .map(v => ({
                    lang:  langMap[v[0]] || v[0].slice(2),
                    value: v[1]._text,
                }));
        } else if (info.bool) {
            const { value } = tag._attributes;

            if (value !== '1') {
                throw new Error(`Tag ${info.index} with non-1 value`);
            } else {
                return true;
            }
        } else if (info.enum != null) {
            const enumId = info.enum === true ? info.index : info.enum;
            const id = tag._attributes.value;

            const filename = (() => {
                switch (enumId) {
                case 'set':
                    return 'set';
                case 'class':
                    return 'class';
                case 'type':
                    return 'type';
                case 'race':
                    return 'race';
                case 'spellSchool':
                    return 'spell-school';
                case 'raceBucket':
                    return 'race-bucket';
                case 'mechanic':
                case 'referencedTag':
                    return 'mechanic';
                case 'puzzleType':
                    return 'puzzle-type';
                case 'playRequirement':
                    return 'play-requirement';
                case 'rarity':
                    return 'rarity';
                case 'faction':
                    return 'faction';
                case 'mercenaryRole':
                    return 'mercenary-role';
                case 'mercenaryFaction':
                    return 'mercenary-faction';
                default:
                    throw new Error(`Unknown enum ${enumId}`);
                }
            })();

            const data = this.getMapData<any>(filename);

            return data[id];
        } else {
            switch (tag._attributes.type as string) {
            case 'Int':
                return Number.parseInt(tag._attributes.value, 10);
            case 'String':
                return tag._text!;
            case 'Card':
                // use hsdata attribute here
                return tag._attributes.cardID!;
            default:
                throw new Error(`New object type ${tag._attributes.type}`);
            }
        }
    }

    async startImpl(): Promise<void> {
        if (!hasData()) {
            return;
        }

        const patch = await db.select().from(Patch).where(eq(Patch.buildNumber, this.buildNumber)).limit(1).then(r => last(r));

        if (patch == null) {
            return;
        }

        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        await repo.reset(ResetMode.HARD, [patch.hash]);

        let count = 0;
        let total = 0;

        this.intervalProgress(500, () => ({
            type:    'load-patch',
            version: this.buildNumber,
            count,
            total,
        }));

        loadPatch.info(`${'='.repeat(20)} ${patch.name} ${'='.repeat(20)}`);

        const cardDefs = fs
            .readFileSync(path.join(localPath, 'CardDefs.xml'))
            .toString();

        const xml = xml2js(cardDefs, {
            compact:           true,
            ignoreDeclaration: true,
            ignoreComment:     true,
        }) as { CardDefs: XCardDefs };

        const entities: IEntity[] = [];
        const cardRelations = [];

        let hasError = false;

        for (const bucket of toBucket(toGenerator(xml.CardDefs.Entity), 500)) {
            const newEntities = [];

            for (const e of bucket) {
                try {
                    const [entity, relations] = parseEntity.call(this, e);

                    newEntities.push(entity);
                    cardRelations.push(...relations);

                    total += 1;
                } catch (errs) {
                    hasError = true;

                    for (const err of errs) {
                        loadPatch.error(`${e._attributes.CardID}: ${err}`);
                    }
                }
            }

            entities.push(...newEntities);
        }

        loadPatch.info('='.repeat(54));

        if (hasError) {
            return;
        }

        for (const r of cardRelations) {
            r.targetId = entities.find(e => e.dbfId.toString() === r.targetId)?.cardId ?? '';
        }

        const strings = getLangStrings();
        const fileJson = getDbfCardFile();

        for (const jsons of toBucket(toGenerator(entities), 500)) {
            const oldData = await Entity.find({ cardId: { $in: jsons.map(j => j.cardId) } });
            const oldCard = await Card.find({ cardId: { $in: jsons.map(j => j.cardId) } });

            const entityToInsert = [];
            const cardToInsert = [];

            for (const e of jsons) {
                const json = fileJson.Records.find(r => r.m_ID === e.dbfId);

                for (const l of e.localization) {
                    const text = l.richText.replace(/[$#](\d+)/g, (_, m) => m);

                    l.displayText = getDisplayText(
                        text,
                        json?.m_cardTextBuilderType ?? TextBuilderType.default,
                        e.cardId,
                        e.mechanics,
                        strings[l.lang],
                    );

                    l.text = l.displayText.replace(/<\/?.>|\[.\]/g, '');
                }

                const eJson = omit(new Entity(e).toJSON(), ['version']);
                const oldJsons = oldData
                    .filter(o => o.cardId === e.cardId)
                    .sort((a, b) => b.version[0] - a.version[0]);

                let entitySaved = false;

                for (const oe of oldJsons) {
                    const oJson = omit(oe.toJSON(), ['version', 'isCurrent']);

                    if (isEqual(oJson, eJson)) {
                        oe.version = uniq([...oe.version, e.version[0]]).sort((a, b) => a - b);
                        await oe.save();
                        entitySaved = true;
                        break;
                    } else if (oJson.powers == null && eJson.powers != null && isEqual(omit(oJson, 'powers'), omit(eJson, 'powers'))) {
                        oe.version = uniq([...oe.version, e.version[0]]).sort((a, b) => a - b);
                        await oe.save();
                        entitySaved = true;
                        break;
                    }
                }

                if (!entitySaved) {
                    entityToInsert.push(e);
                }

                const c = oldCard.find(c => c.cardId === e.cardId);

                if (c == null) {
                    if (e.type !== 'enchantment') {
                        cardToInsert.push({ cardId: e.cardId, changes: [] });
                    }
                } else {
                    const changes = c.changes;

                    c.changes = oldJsons.map(j => j.version).map(ov => {
                        const cv = changes.find(ch => intersection(ch.version, ov).length > 0);

                        if (cv == null) {
                            return { version: ov, change: 'unknown' };
                        } else {
                            return { version: ov, change: cv.change };
                        }
                    });

                    await c.save();
                }

                count += 1;
            }

            await Card.insertMany(cardToInsert);
            await Entity.insertMany(entityToInsert);
        }

        for (const relations of toBucket(toGenerator(cardRelations), 500)) {
            const maybeRelations = await CardRelation.find({ sourceId: { $in: relations.map(r => r.sourceId) } });

            const relationToInsert: ICardRelation[] = [];

            for (const relation of relations) {
                const exactRelation = maybeRelations.find(r => r.relation == relation.relation && r.sourceId === relation.sourceId && r.targetId == relation.relation);

                if (exactRelation != null) {
                    exactRelation.version = uniq([...exactRelation.version, this.buildNumber]).sort((a, b) => a - b);

                    await exactRelation.save();
                } else {
                    relationToInsert.push({
                        ...relation,
                        version: [this.buildNumber],
                    });
                }
            }

            await CardRelation.insertMany(relationToInsert);
        }

        await db.update(Patch).set({ isUpdated: true });

        if (patch.isCurrent) {
            await Entity.updateMany({}, { isCurrent: false });
            await Entity.updateMany({ version: patch.buildNumber }, { isCurrent: true });
        }

        loadPatch.info(`Patch ${this.buildNumber} has been loaded`, { category: 'hsdata' });
    }

    stopImpl(): void { /* no-op */ }
}
