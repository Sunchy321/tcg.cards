import { HsdataParser, langMap } from './base';

import {
    EntityLocalization, entityLocalization as entityLocalizationSchema,
    Entity as IEntity, entity as entitySchema,
    PlayRequirement, playRequirement as playRequirementSchema,
    Power, power as powerSchema,
    Rune,
} from '@model/hearthstone/schema/entity';

import { Classes, Race } from '@model/hearthstone/schema/basic';
import { CardRelation as ICardRelation } from '@model/hearthstone/schema/card-relation';
import { XEntity, XLocStringTag, XTag } from '@model/hearthstone/schema/data/hsdata';
import { ITag } from './task';

import _ from 'lodash';

import { loadPatch as log } from '@/hearthstone/logger';

type Nullable<T> = {
    [P in keyof T]: T[P] | null;
};

export function parseCardId(entity: XEntity): { cardId: string, dbfId: number } {
    const cardId = entity._attributes.CardID;
    const dbfId = Number.parseInt(entity._attributes.ID, 10);

    if (cardId == null || dbfId == null) {
        throw new Error(`Invalid entity: ${JSON.stringify(entity)}`);
    }

    return { cardId, dbfId };
}

export function parseEntity(this: HsdataParser, entity: XEntity, cardIdMap: Record<number, string>): [IEntity, Power[], ICardRelation[]] {
    const result = Object.fromEntries(Object.keys(entitySchema.shape).map(k => [k, null])) as Nullable<IEntity>;

    const powers: Power[] = [];
    const relations: ICardRelation[] = [];

    const masters: string[] = [];
    const errors: string[] = [];

    result.version = [this.buildNumber];
    result.cardId = entity._attributes.CardID;
    result.dbfId = Number.parseInt(entity._attributes.ID, 10);

    result.classes = [];
    result.mechanics = [];
    result.referencedTags = [];

    const locFields = this.getSpecialData<Record<string, keyof IEntity['localization'][0]>>('localization-field');
    const fields = this.getSpecialData<Record<string, ITag>>('field');

    const localization: Nullable<IEntity['localization'][0]>[] = [];

    const quest: Nullable<Pick<IEntity, 'questPart' | 'questProgress' | 'questType'>> = {
        questPart:     null,
        questProgress: null,
        questType:     null,
    };

    for (const k of Object.keys(entity)) {
        switch (k) {
        case '_attributes':
            break;
        case 'Tag': {
            for (const t of _.castArray(entity[k])) {
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
                            (loc as any)[locField] = text;
                        } else {
                            localization.push({
                                ...Object.fromEntries(Object.keys(entityLocalizationSchema.shape).map(
                                    k => [k, null],
                                )) as Nullable<EntityLocalization>,

                                locChangeType: 'unknown',

                                [locField]: text,
                                lang,
                            });
                        }
                    }

                    continue;
                }

                const field = fields[id];

                if (field?.index === 'multiClass') {
                    const classMap = this.getMapData<Classes>('class');

                    const classes: Classes[] = [];

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
                        const { value: tagValue, alsoMechanic = false } = this.getValue(t, field, cardIdMap);

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

                        if (alsoMechanic) {
                            log.info(`Tag ${field.index} is also a mechanic`);

                            const mechanic = this.getMapData<string>('mechanic')[id];

                            if (type !== 'Int' && type !== 'Card') {
                                errors.push(`Incorrect type ${type} of mechanic ${mechanic}`);
                            }

                            if (mechanic != null) {
                                switch (mechanic) {
                                case 'quest':
                                    if (quest.questType == null) {
                                        quest.questType = 'normal';
                                    }
                                    break;
                                case 'sidequest':
                                    quest.questType = 'side';
                                    break;
                                case 'quest_progress':
                                    quest.questProgress = value;
                                    break;
                                case 'questline':
                                    quest.questType = 'questline';
                                    break;
                                case 'questline_part':
                                    quest.questPart = value;
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
                            }
                        }
                    } catch (e: any) {
                        errors.push(e.message);
                    }

                    continue;
                }

                const rune = this.getMapData<Rune>('rune')[id];

                if (rune != null) {
                    if (result.rune == null) {
                        result.rune = [];
                    }

                    for (let i = 0; i < value; i += 1) {
                        result.rune.push(rune);
                    }

                    continue;
                }

                const dualRace = this.getMapData<Race>('dual-race')[id];

                if (dualRace != null) {
                    if (result.race != null) {
                        result.race!.push(dualRace);
                    } else {
                        log.info(`${result.cardId} has dual-race but no race`);
                    }

                    continue;
                }

                const raceBucket = this.getMapData<Race>('race-bucket')[id];

                if (raceBucket != null) {
                    result.raceBucket = raceBucket;
                    continue;
                }

                const relatedEntity = this.getMapData<string>('related-entity')[id];

                if (relatedEntity != null) {
                    relations.push({
                        relation: relatedEntity,
                        version:  [this.buildNumber],
                        sourceId: result.cardId,
                        targetId: cardIdMap[Number.parseInt((t as XTag)._attributes.value, 10)] ?? '',
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
                        if (quest.questType == null) {
                            quest.questType = 'normal';
                        }
                        break;
                    case 'sidequest':
                        quest.questType = 'side';
                        break;
                    case 'quest_progress':
                        quest.questProgress = value;
                        break;
                    case 'questline':
                        quest.questType = 'questline';
                        break;
                    case 'questline_part':
                        quest.questPart = value;
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

            result.questType = quest.questType;
            result.questProgress = quest.questProgress;
            result.questPart = quest.questPart;

            break;
        }
        case 'Power': {
            for (const p of _.castArray(entity[k])) {
                const power: Partial<Power> = {};

                power.definition = p._attributes.definition;

                if (p.PlayRequirement != null) {
                    power.playRequirements = [];

                    for (const r of _.castArray(p.PlayRequirement)) {
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

                        power.playRequirements.push(playRequirementSchema.parse(req));
                    }
                }

                powers.push(powerSchema.parse(power));
            }

            break;
        }
        case 'ReferencedTag': {
            result.referencedTags = [];

            for (const r of _.castArray(entity[k])) {
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
            result.entourages = _.castArray(entity[k]).map(
                v => v._attributes.cardID,
            );

            break;
        }
        case 'MasterPower': {
            for (const m of _.castArray(entity[k])) {
                masters.push(m._text);
            }
            break;
        }
        case 'TriggeredPowerHistoryInfo': {
            for (const t of _.castArray(entity[k])) {
                const index = Number.parseInt(t._attributes.effectIndex, 10);
                const inHistory = t._attributes.showInHistory;

                const p = powers[index];

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

    if (masters.length > 0) {
        for (const m of masters) {
            for (const p of powers) {
                if (p.definition === m) {
                    p.isMaster = true;
                }
            }
        }
    }

    result.localization = localization as EntityLocalization[];

    for (const l of result.localization) {
        if (l.richText == null) {
            l.richText = '';
        }

        if (l.name == null) {
            l.name = '';
        }

        l.displayText = l.richText;
        l.text = l.richText
            .replace(/[$#](\d+)/g, (_, m) => m)
            .replace(/<\/?.>|\[.\]/g, '');
    }

    if (result.type == null) {
        result.type = 'null';
    }

    if (result.set == null) {
        result.set = '';
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

    if (result.inBobsTavern == null) {
        result.inBobsTavern = false;
    }

    if (result.collectible == null) {
        result.collectible = false;
    }

    if (result.elite == null) {
        result.elite = false;
    }

    if (result.artist == null) {
        result.artist = '';
    }

    result.textBuilderType = 'default';
    result.changeType = 'unknown';
    result.isLatest = false;

    return [entitySchema.parse(result), powers, relations];
}
