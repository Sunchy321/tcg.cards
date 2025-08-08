import Task from '@/common/task';

import git, { ResetMode } from 'simple-git';

import { Entity as IEntity } from '@model/hearthstone/schema/entity';
import { XCardDefs, XLocStringTag, XTag } from '@model/hearthstone/schema/data/hsdata';

import { arrayContains, desc, eq, lt } from 'drizzle-orm';

import * as fs from 'fs';
import * as path from 'path';
import { xml2js } from 'xml-js';
import _ from 'lodash';

import { db } from '@/drizzle';
import { Patch } from '@/hearthstone/schema/patch';
import { Entity } from '@/hearthstone/schema/entity';

import internalData from '@/internal-data';
import { TextBuilderType, getLangStrings, getDbfCardFile, getDisplayText } from '@/hearthstone/blizzard/display-text';
import { insertCards, insertEntities, insertRelation } from '../insert';
import { parseCardId, parseEntity } from './parse';

import { localPath, langMap } from './base';

import { loadPatch } from '@/hearthstone/logger';

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

    private getValue(tag: XLocStringTag | XTag, info: ITag, cardIdMap: Record<number, string>): any {
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

            if (info.enum === 'cardId') {
                return cardIdMap[Number.parseInt(id, 10)] ?? '';
            }

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

        const patch = await db.select()
            .from(Patch)
            .where(eq(Patch.buildNumber, this.buildNumber))
            .limit(1)
            .then(rows => rows[0]);

        if (patch == null) {
            return;
        }

        const lastPatch = await db.select()
            .from(Patch)
            .where(lt(Patch.buildNumber, this.buildNumber))
            .orderBy(desc(Patch.buildNumber))
            .then(rows => rows[0]);

        const lastNumber = lastPatch?.buildNumber ?? 0;

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

        const cardIdMap: Record<number, string> = {};

        for (const entity of xml.CardDefs.Entity) {
            const { cardId, dbfId } = parseCardId(entity);

            cardIdMap[dbfId] = cardId;
        }

        for (const e of xml.CardDefs.Entity) {
            try {
                const [entity, _powers, relations] = parseEntity.call(this, e, cardIdMap);

                entities.push(entity);
                cardRelations.push(...relations);

                total += 1;
            } catch (err: any) {
                hasError = true;

                if (!Array.isArray(err)) {
                    loadPatch.error(`${e._attributes.CardID}: ${err}`);

                    throw err;
                } else {
                    for (const e of err) {
                        loadPatch.error(`${e._attributes.CardID}: ${e}`);
                    }
                }
            }
        }

        loadPatch.info('='.repeat(54));

        if (hasError) {
            throw new Error('Some entities failed to parse, see log for details');
        }

        const strings = getLangStrings();
        const fileJson = getDbfCardFile();

        for (const entity of entities) {
            if (this.status === 'idle') {
                return;
            }

            const json = fileJson.Records.find(r => r.m_ID === entity.dbfId);

            for (const l of entity.localization) {
                const text = l.richText.replace(/[$#](\d+)/g, (_, m) => m);

                l.displayText = getDisplayText(
                    text,
                    json?.m_cardTextBuilderType ?? TextBuilderType.default,
                    entity.cardId,
                    entity.mechanics,
                    strings[l.lang],
                );

                l.text = l.displayText.replace(/<\/?.>|\[.\]/g, '');
            }
        }

        for (const bucket of _.chunk(entities, 500)) {
            const cards = bucket.filter(c => c.type !== 'enchantment').map(c => ({
                cardId:     c.cardId,
                legalities: {},
            }));

            await insertCards(cards);
            await insertEntities(bucket, this.buildNumber, lastNumber);

            count += bucket.length;
        }

        for (const relation of cardRelations) {
            await insertRelation(relation);
        }

        await db.update(Patch)
            .set({ isUpdated: true })
            .where(eq(Patch.buildNumber, this.buildNumber));

        if (patch.isLatest) {
            await db.transaction(async tx => {
                await tx.update(Entity).set({ isLatest: false });

                await tx.update(Entity)
                    .set({ isLatest: true })
                    .where(arrayContains(Entity.version, [patch.buildNumber]));
            });
        }

        loadPatch.info(`Patch ${this.buildNumber} has been loaded`, { category: 'hsdata' });
    }

    stopImpl(): void { /* no-op */ }
}
