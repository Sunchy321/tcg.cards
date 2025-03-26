import git, { SimpleGitProgressEvent, ResetMode } from 'simple-git';

import {
    XCardDefs, XEntity, XLocStringTag, XTag,
} from '@interface/hearthstone/hsdata/xml';

import Patch from '@/hearthstone/db/patch';
import Entity from '@/hearthstone/db/entity';
import CardRelation from '@/hearthstone/db/card-relation';
import Task from '@/common/task';

import { Entity as IEntity, PlayRequirement, Power } from '@interface/hearthstone/entity';
import { CardRelation as ICardRelation } from '@interface/hearthstone/card-relation';

import * as fs from 'fs';
import * as path from 'path';
import { xml2js } from 'xml-js';
import {
    castArray, isEqual, last, omit, uniq,
} from 'lodash';

import {
    TextBuilderType, getLangStrings, getDbfCardFile, getDisplayText,
} from '@/hearthstone/blizzard/display-text';

import { localPath, langMap } from './base';
import * as logger from '@/logger';

import { toBucket, toGenerator } from '@/common/to-bucket';
import { toIdentifier } from '@common/util/id';
import internalData from '@/internal-data';
import { loadPatch } from '../logger';

const remoteUrl = 'git@github.com:HearthSim/hsdata.git';

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

export class DataGetter extends Task<SimpleGitProgressEvent & { type: 'get' }> {
    async startImpl(): Promise<void> {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        if (!fs.existsSync(path.join(localPath, '.git'))) {
            await repo.clone(remoteUrl);

            logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
        } else {
            await repo.fetch(['--all']);
            await repo.reset(ResetMode.HARD, ['origin/master']);

            logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
        }
    }

    stopImpl(): void { /* no-op */ }
}

export interface ILoaderStatus {
    type:  'load';
    count: number;
    total: number;
}

const messagePrefix = 'Update to patch';

export class DataLoader extends Task<ILoaderStatus> {
    async startImpl(): Promise<void> {
        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        const log = await repo.log();
        const commits = log.all.filter(v => v.message.startsWith(messagePrefix));

        let count = 0;
        const total = commits.length;

        for (const c of commits) {
            const version = c.message.slice(messagePrefix.length).trim();
            const number = Number.parseInt(last(version.split('.'))!, 10);
            const { hash } = c;

            const patch = await Patch.findOne({ version });

            if (patch == null) {
                const newPatch = new Patch({ version, number, hash });

                await newPatch.save();
            } else {
                patch.hash = hash;

                await patch.save();
            }

            count += 1;

            this.emit('progress', { type: 'load', count, total });
        }

        const patches = await Patch.find();

        const maxVersion = Math.max(...patches.map(p => p.number));

        for (const p of patches) {
            if (p.isCurrent && p.number !== maxVersion) {
                p.isCurrent = false;

                await p.save();
            } else if (!p.isCurrent && p.number === maxVersion) {
                p.isCurrent = true;

                await p.save();
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}

export interface IClearPatchStatus {
    type:    'clear-patch';
    version: number;
    count:   number;
    total:   number;
}

export class PatchClearer extends Task<IClearPatchStatus> {
    version: number;

    constructor(version: number) {
        super();
        this.version = version;
    }

    async startImpl(): Promise<void> {
        if (!hasData()) {
            return;
        }

        const patch = await Patch.findOne({ number: this.version });

        if (patch == null) {
            return;
        }

        let count = 0;
        const total = await Entity.countDocuments({ version: this.version });

        this.intervalProgress(500, () => ({
            type:    'clear-patch',
            version: this.version,
            count,
            total,
        }));

        const entities = await Entity.find({ version: this.version });

        for (const e of entities) {
            if (e.version.length > 1) {
                e.version = e.version.filter(v => v !== this.version);
                await e.save();
            } else {
                await e.delete();
            }

            count += 1;
        }

        count = 0;

        patch.isUpdated = false;

        await patch.save();

        logger.data.info(`Patch ${this.version} has been removed`, { category: 'hsdata' });
    }

    stopImpl(): void { /* no-op */ }
}

export interface ILoadPatchStatus {
    type:    'load-patch';
    version: number;
    count:   number;
    total:   number;
}

export class PatchLoader extends Task<ILoadPatchStatus> {
    version: number;

    data: Record<string, any> = { };

    constructor(version: number) {
        super();
        this.version = version;
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

        const patch = await Patch.findOne({ number: this.version });

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
            version: this.version,
            count,
            total,
        }));

        loadPatch.info(`${'='.repeat(20)} ${patch.version} ${'='.repeat(20)}`);

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
                    const [entity, relations] = this.convert(e);

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

            const bucketEntities = await Entity.find({ entityId: { $in: newEntities.map(e => e.entityId) } });

            for (const e of newEntities) {
                const defaultCardId = (() => {
                    let id = toIdentifier(e.localization?.find(l => l.lang === 'en')?.name ?? e.entityId);

                    if (e.type === 'enchantment') {
                        id += ';enchantment';
                    }

                    return id;
                })();

                const sameIdEntities = bucketEntities.filter(o => o.entityId === e.entityId);

                if (sameIdEntities.length > 0) {
                    const cardIds = uniq(sameIdEntities.map(e => e.cardId));

                    if (cardIds.length > 1) {
                        loadPatch.error(`Multiple card ids ${cardIds.join(', ')}`);
                        e.cardId = defaultCardId;
                    }

                    e.cardId = cardIds[0];
                } else {
                    e.cardId = defaultCardId;
                }
            }

            entities.push(...newEntities);
        }

        loadPatch.info('='.repeat(54));

        if (hasError) {
            return;
        }

        for (const r of cardRelations) {
            r.targetId = entities.find(e => e.dbfId.toString() === r.targetId)?.entityId ?? '';
        }

        const strings = getLangStrings();
        const fileJson = getDbfCardFile();

        for (const jsons of toBucket(toGenerator(entities), 500)) {
            const oldData = await Entity.find({ entityId: { $in: jsons.map(j => j.entityId) } });

            for (const e of jsons) {
                const json = fileJson.Records.find(r => r.m_ID === e.dbfId);

                for (const l of e.localization) {
                    const text = l.rawText.replace(/[$#](\d+)/g, (_, m) => m);

                    l.displayText = getDisplayText(
                        text,
                        json?.m_cardTextBuilderType ?? TextBuilderType.default,
                        e.entityId,
                        e.mechanics,
                        strings[l.lang],
                    );

                    l.text = l.displayText.replace(/<\/?.>|\[.\]/g, '');
                }

                const eJson = omit(new Entity(e).toJSON(), ['version']);
                const oldJsons = oldData
                    .filter(o => o.entityId === e.entityId)
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
                    await Entity.create(e);
                }

                count += 1;
            }
        }

        for (const relations of toBucket(toGenerator(cardRelations), 500)) {
            const maybeRelations = await CardRelation.find({ sourceId: { $in: relations.map(r => r.sourceId) } });

            const relationToInsert: ICardRelation[] = [];

            for (const relation of relations) {
                const exactRelation = maybeRelations.find(r => r.relation == relation.relation && r.sourceId === relation.sourceId && r.targetId == relation.relation);

                if (exactRelation != null) {
                    exactRelation.version = uniq([...exactRelation.version, this.version]).sort((a, b) => a - b);

                    await exactRelation.save();
                } else {
                    relationToInsert.push({
                        ...relation,
                        version: [this.version],
                    });
                }
            }

            await CardRelation.insertMany(relationToInsert);
        }

        patch.isUpdated = true;

        await patch.save();

        if (patch.isCurrent) {
            await Entity.updateMany({}, { isCurrent: false });
            await Entity.updateMany({ version: patch.number }, { isCurrent: true });
        }

        logger.data.info(`Patch ${this.version} has been loaded`, { category: 'hsdata' });
    }

    private convert(entity: XEntity): [IEntity, ICardRelation[]] {
        const result: Partial<IEntity> = { };
        const relations: ICardRelation[] = [];

        const masters: string[] = [];
        const errors: string[] = [];

        result.version = [this.version];
        result.entityId = entity._attributes.CardID;
        result.dbfId = Number.parseInt(entity._attributes.ID, 10);

        result.classes = [];
        result.mechanics = [];
        result.referencedTags = [];

        const locFields = this.getSpecialData<Record<string, keyof IEntity['localization'][0]>>('localization-field');
        const fields = this.getSpecialData<Record<string, ITag>>('field');

        const localization: Partial<IEntity['localization'][0]>[] = [];
        const quest: Partial<IEntity['quest']> = { };

        for (const k of Object.keys(entity)) {
            switch (k) {
            case '_attributes':
                break;
            case 'Tag': {
                for (const t of castArray(entity[k])) {
                    const id = t._attributes.enumID;

                    const { type } = t._attributes;

                    const value = Number.parseInt((t as XTag)._attributes.value, 10);

                    const locField = locFields[id];

                    if (locField != null) {
                        for (const k of Object.keys(t as XLocStringTag)) {
                            if (k === '_attributes') {
                                continue;
                            }

                            const lang = langMap[k] ?? k.slice(2);
                            const text = (t as any)[k]._text as string;

                            const loc = localization.find(l => l.lang === lang);

                            if (loc != null) {
                                loc[locField] = text;
                            } else {
                                localization.push({ lang, [locField]: text });
                            }
                        }

                        continue;
                    }

                    const field = fields[id];

                    if (field?.index === 'multiClass') {
                        const classMap = this.getMapData<string>('class');

                        const classes = [];

                        for (const [k, v] of Object.entries(classMap)) {
                            const num = Number.parseInt(k, 10) - 1;

                            if ((value & (1 << num)) !== 0) {
                                classes.push(v);
                            }
                        }

                        result.classes = classes;

                        continue;
                    } else if (field != null) {
                        try {
                            const tagValue = this.getValue(t, field);

                            if (tagValue == null) {
                                errors.push(`Unknown tag ${
                                    field.enum === true ? field.index : field.enum
                                } of ${(t as XTag)._attributes.value}`);
                            }

                            if (field.array) {
                                if (result[field.index] == null) {
                                    (result as any)[field.index] = [];
                                }

                                (result as any)[field.index].push(tagValue);
                            } else {
                                (result as any)[field.index] = tagValue;
                            }
                        } catch (e) {
                            errors.push(e.message);
                        }

                        continue;
                    }

                    const rune = this.getMapData<string>('rune')[id];

                    if (rune != null) {
                        if (result.rune == null) {
                            result.rune = [];
                        }

                        for (let i = 0; i < value; i += 1) {
                            result.rune.push(rune);
                        }

                        continue;
                    }

                    const dualRace = this.getMapData<string>('dual-race')[id];

                    if (dualRace != null) {
                        if (result.race != null) {
                            result.race!.push(dualRace);
                        } else {
                            loadPatch.info(`${result.entityId} has dual-race but no race`);
                        }

                        continue;
                    }

                    const raceBucket = this.getMapData<string>('race-bucket')[id];

                    if (raceBucket != null) {
                        result.raceBucket = raceBucket;
                        continue;
                    }

                    const relatedEntity = this.getMapData<string>('related-entity')[id];

                    if (relatedEntity != null) {
                        relations.push({
                            relation: relatedEntity,
                            version:  [],
                            sourceId: result.entityId,
                            targetId: (t as XTag)._attributes.value,
                        });

                        continue;
                    }

                    const mechanic = this.getMapData<string>('mechanic')[id];

                    if (type !== 'Int' && type !== 'Card') {
                        errors.push(`Incorrect type ${type} of mechanic ${mechanic}`);
                    }

                    if (mechanic != null) {
                        switch (mechanic) {
                        case 'quest':
                            if (quest.type == null) {
                                quest.type = 'normal';
                            }
                            break;
                        case 'sidequest':
                            quest.type = 'side';
                            break;
                        case 'quest_progress':
                            quest.progress = value;
                            break;
                        case 'questline':
                            quest.type = 'questline';
                            break;
                        case 'questline_part':
                            quest.part = value;
                            break;
                        default:
                            break;
                        }

                        if (this.getSpecialData<string[]>('mechanic-with-value').includes(mechanic)) {
                            result.mechanics.push(`${mechanic}:${value}`);
                        } else if (this.getSpecialData<string[]>('mechanic-ignore-value').includes(mechanic)) {
                            result.mechanics.push(mechanic);
                        } else if (value === 1) {
                            result.mechanics.push(mechanic);
                        } else {
                            errors.push(`Mechanic ${mechanic} with non-1 value`);
                        }

                        continue;
                    }

                    errors.push(`Unknown tag ${id}`);
                }

                if (quest.type != null) {
                    result.quest = quest as IEntity['quest'];
                }

                break;
            }
            case 'Power': {
                result.powers = [];

                for (const p of castArray(entity[k])) {
                    const power: Partial<Power> = {};

                    power.definition = p._attributes.definition;

                    if (p.PlayRequirement != null) {
                        power.playRequirements = [];

                        for (const r of castArray(p.PlayRequirement)) {
                            const type = this.getMapData<string>('play-requirement')[r._attributes.reqID];

                            const { param } = r._attributes;

                            if (type == null) {
                                errors.push(
                                    `Unknown play requirements ${r._attributes.reqID}`,
                                );
                            }

                            const req: Partial<PlayRequirement> = { type };

                            if (param !== '') {
                                req.param = Number.parseInt(param, 10);
                            }

                            power.playRequirements.push(req as PlayRequirement);
                        }
                    }

                    result.powers.push(power as Power);
                }

                break;
            }
            case 'ReferencedTag': {
                result.referencedTags = [];

                for (const r of castArray(entity[k])) {
                    const id = r._attributes.enumID;

                    const req = this.getMapData<string>('mechanic')[id];

                    if (req === undefined) {
                        errors.push(`Unknown referenced tag ${id} <${r._attributes.name}>`);
                    } else if (req === null) {
                        continue;
                    }

                    const { value } = r._attributes;

                    if (value !== '1') {
                        switch (req) {
                        case 'windfury':
                            if (value === '3') {
                                result.referencedTags.push('mega_windfury');
                                break;
                            }
                            // fallthrough
                        default:
                            errors.push(
                                `Referenced tag ${id} with non-1 value <${r._attributes.name}>`,
                            );
                        }
                    } else {
                        result.referencedTags.push(req);
                    }
                }

                break;
            }
            case 'EntourageCard': {
                result.entourages = castArray(entity[k]).map(
                    v => v._attributes.cardID,
                );

                break;
            }
            case 'MasterPower': {
                for (const m of castArray(entity[k])) {
                    masters.push(m._text);
                }
                break;
            }
            case 'TriggeredPowerHistoryInfo': {
                for (const t of castArray(entity[k])) {
                    const index = Number.parseInt(t._attributes.effectIndex, 10);
                    const inHistory = t._attributes.showInHistory;

                    const p = result.powers?.[index];

                    if (p != null) {
                        p.showInHistory = inHistory === 'True';
                    }
                }
                break;
            }

            default:
                errors.push(`Unknown key ${k}`);
            }
        }

        if (errors.length > 0) {
            throw errors;
        }

        if (result.powers != null && masters.length > 0) {
            for (const m of masters) {
                for (const p of result.powers) {
                    if (p.definition === m) {
                        p.isMaster = true;
                    }
                }
            }
        }

        result.localization = localization as IEntity['localization'];

        for (const l of result.localization) {
            if (l.rawText == null) {
                l.rawText = '';
            }

            l.displayText = l.rawText;
            l.text = l.rawText
                .replace(/[$#](\d+)/g, (_, m) => m)
                .replace(/<\/?.>|\[.\]/g, '');
        }

        // fix 0 issue
        if (result.cost == null) {
            result.cost = 0;
        }

        if (result.type === 'minion') {
            if (result.attack != null && result.health == null) {
                result.health = 0;
            }

            if (result.attack == null && result.health != null) {
                result.attack = 0;
            }
        } else if (result.type === 'weapon') {
            if (result.attack != null && result.durability == null) {
                result.durability = 0;
            }

            if (result.attack == null && result.durability != null) {
                result.attack = 0;
            }
        }

        return [result as IEntity, relations];
    }

    stopImpl(): void { /* no-op */ }
}
