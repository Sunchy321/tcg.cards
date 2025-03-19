import { Entity as IEntity } from '@interface/hearthstone/entity';
import { FormatChange as IFormatChange } from '@interface/hearthstone/format-change';

import { ITag } from '../hsdata';

import internalData from '@/internal-data';
import { pickBy } from 'lodash';

export type TagMap = {
    field: Record<number, ITag>;
    locField: Record<number, keyof IEntity['localization'][0]>;
    type: Record<number, string>;
    race: Record<number, string>;
    dualRace: Record<number, string>;
    spellSchool: Record<number, string>;
    rune: Record<number, string>;
    set: Record<number, string>;
    rarity: Record<number, string>;
    mechanic: Record<number, string>;
};

export function getEssentialMap(): TagMap {
    return {
        field:       internalData('hearthstone.tag.field'),
        locField:    internalData('hearthstone.tag.localization-field'),
        type:        internalData('hearthstone.tag.map.type'),
        race:        internalData('hearthstone.tag.map.race'),
        dualRace:    internalData('hearthstone.tag.map.dual-race'),
        spellSchool: internalData('hearthstone.tag.map.spell-school'),
        rune:        internalData('hearthstone.tag.map.rune'),
        set:         internalData('hearthstone.tag.map.set'),
        rarity:      internalData('hearthstone.tag.map.rarity'),
        mechanic:    internalData('hearthstone.tag.map.mechanic'),
    };
}

type Variant = 'battlegrounds' | 'diamond' | 'golden' | 'in-game' | 'normal' | 'signature';

const variantInput: Record<Variant, any> = {
    'normal': { },
    'golden': {
        premium: 1,
    },
    'diamond': {
        premium: 2,
    },
    'signature': {
        premium: 3,
    },
    'battlegrounds': {
        useBattlegroundsStyle: 1,
    },
    'in-game': {
        useHeroStyle: 1,
    },
};

export type ApolloJson = {
    cardID: string;
    cardName: string;
    cardText: string;
    tags: Record<number, number>;
    nerf?: Record<number, number>;
    outName?: string;
};

export function intoApolloJson(
    entity: IEntity,
    tagMap: TagMap,
    adjustment?: Required<IFormatChange>['adjustment'][0]['detail'],
    variant: Variant = 'normal',
): ApolloJson {
    const id = entity.entityId;

    const loc = entity.localization.find(v => v.lang === 'zhs')
        ?? entity.localization.find(v => v.lang === 'en')
        ?? entity.localization[0];

    const tags: Record<number, number> = {};

    const {
        field, locField, type, race, dualRace, spellSchool, rune, set, rarity, mechanic,
    } = tagMap;

    const fieldKey = (key: keyof IEntity) => Number.parseInt(Object.entries(field).find(v => v[1].index === key)![0], 10);
    const locFieldKey = (key: keyof IEntity['localization'][0]) => Number.parseInt(Object.entries(locField).find(v => v[1] === key)![0], 10);

    const invertFind = (map: Record<number, string>, value: string) => Number.parseInt(Object.entries(map).find(v => v[1] === value)?.[0] ?? '0', 10);

    tags[fieldKey('type')] = invertFind(type, entity.type);
    tags[fieldKey('cost')] = entity.cost ?? 0;
    tags[fieldKey('attack')] = entity.attack ?? 0;
    tags[fieldKey('health')] = entity.health ?? 0;
    tags[fieldKey('durability')] = entity.durability ?? 0;
    tags[fieldKey('armor')] = entity.armor ?? 0;

    if (entity.race != null) {
        tags[fieldKey('race')] = invertFind(race, entity.race[0]);

        for (const [k, v] of Object.entries(dualRace)) {
            tags[Number.parseInt(k, 10)] = entity.race[1] === v ? 1 : 0;
        }
    } else {
        tags[fieldKey('race')] = 0;

        for (const [k, _v] of Object.entries(dualRace)) {
            tags[Number.parseInt(k, 10)] = 0;
        }
    }

    if (entity.spellSchool != null) {
        tags[fieldKey('spellSchool')] = invertFind(spellSchool, entity.spellSchool);
    } else {
        tags[fieldKey('spellSchool')] = 0;
    }

    tags[fieldKey('set')] = invertFind(set, entity.set);

    if (entity.rarity != null) {
        tags[fieldKey('rarity')] = invertFind(rarity, entity.rarity!);
    }

    tags[fieldKey('elite')] = entity.elite ? 1 : 0;
    tags[fieldKey('techLevel')] = entity.techLevel ?? 0;

    tags[invertFind(rune, 'blood')] = entity.rune?.includes('blood') ? 1 : 0;
    tags[invertFind(rune, 'frost')] = entity.rune?.includes('frost') ? 1 : 0;
    tags[invertFind(rune, 'unholy')] = entity.rune?.includes('unholy') ? 1 : 0;
    tags[invertFind(mechanic, 'tradable')] = entity.mechanics.includes('tradable') ? 1 : 0;
    tags[invertFind(mechanic, 'forge')] = entity.mechanics.includes('forge') ? 1 : 0;
    tags[invertFind(mechanic, 'hide_cost')] = entity.mechanics.includes('hide_cost') ? 1 : 0;
    tags[invertFind(mechanic, 'hide_attack')] = entity.mechanics.includes('hide_attack') ? 1 : 0;
    tags[invertFind(mechanic, 'hide_health')] = entity.mechanics.includes('hide_health') ? 1 : 0;
    tags[invertFind(mechanic, 'in_mini_set')] = entity.mechanics.includes('in_mini_set') ? 1 : 0;
    tags[invertFind(mechanic, 'hide_watermark')] = entity.mechanics.includes('hide_watermark') ? 1 : 0;

    let nerf: Record<number, number> = {};

    const partMap: Record<string, number> = {
        cost:          fieldKey('cost'),
        attack:        fieldKey('attack'),
        health:        fieldKey('health'),
        durability:    fieldKey('health'),
        armor:         fieldKey('armor'),
        text:          locFieldKey('rawText'),
        race:          fieldKey('race'),
        techLevel:     fieldKey('techLevel'),
        rarity:        fieldKey('rarity'),
        school:        fieldKey('spellSchool'),
        colddown:      fieldKey('colddown'),
        mercenaryRole: fieldKey('mercenaryRole'),
        rune:          2196, // hardcoded blood rune
    };

    if (adjustment != null && adjustment.length > 0) {
        for (const d of adjustment) {
            if (partMap[d.part] != null) {
                nerf[partMap[d.part]] = d.status === 'buff' ? 1 : 2;
            } else {
                console.error(`Unknown part ${d.part}`);
            }
        }

        nerf = pickBy(nerf, (_value, _key) => {
            // Hero Power has no nerf effect
            if (entity.type === 'hero_power') {
                return false;
            }

            // Trinket's nerf effect is at wrong place
            if (entity.mechanics.includes('trinket')) {
                return false;
            }

            return true;
        });
    }

    return {
        cardID:   id,
        cardName: loc.name,
        cardText: loc.rawText,
        tags,
        ...adjustment != null ? { nerf } : {},
        ...variantInput[variant],
    };
}
