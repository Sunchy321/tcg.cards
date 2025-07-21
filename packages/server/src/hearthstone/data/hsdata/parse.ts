import { HsdataParser, langMap } from './base';

import { Entity as IEntity, PlayRequirement, Power } from '@interface/hearthstone/entity';
import { CardRelation as ICardRelation } from '@interface/hearthstone/card-relation';
import { XEntity, XLocStringTag, XTag } from '@interface/hearthstone/hsdata/xml';
import { ITag } from './task';

import { castArray } from 'lodash';

import { loadPatch } from '@/hearthstone/logger';

export function parseEntity(this: HsdataParser, entity: XEntity): [IEntity, ICardRelation[]] {
    const result: Partial<IEntity> = { };
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
                        loadPatch.info(`${result.cardId} has dual-race but no race`);
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
                        sourceId: result.cardId,
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
        if (l.richText == null) {
            l.richText = '';
        }

        l.displayText = l.richText;
        l.text = l.richText
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
