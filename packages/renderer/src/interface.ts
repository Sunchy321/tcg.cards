import { Entity } from '@interface/hearthstone/entity';
import { Adjustment } from '@interface/hearthstone/format-change';

export interface EntityRenderData {
    variant:     'diamond' | 'golden' | 'normal';
    costType?:   'coin' | 'mana' | 'speed';
    format?:     string;
    adjustment?: { part: string, status: Adjustment }[];

    entityId: string;

    lang:     string;
    name:     string;
    text:     string;
    illusId?: string;

    set:          Entity['set'];
    classes:      Entity['classes'];
    type:         Entity['type'];
    cost?:        Entity['cost'];
    attack?:      Entity['attack'];
    health?:      Entity['health'];
    durability?:  Entity['durability'];
    armor?:       Entity['armor'];
    rune?:        Entity['rune'];
    race?:        Entity['race'];
    spellSchool?: Entity['spellSchool'];

    techLevel?:    Entity['techLevel'];
    inBobsTavern?: Entity['inBobsTavern'];
    tripleCard?:   Entity['tripleCard'];
    raceBucket?:   Entity['raceBucket'];
    coin?:         Entity['coin'];
    armorBucket?:  Entity['armorBucket'];
    buddy?:        Entity['buddy'];
    bannedRace?:   Entity['bannedRace'];

    mercenaryRole?: Entity['mercenaryRole'];
    colddown?:      Entity['colddown'];

    collectible: Entity['collectible'];
    elite:       Entity['elite'];
    rarity?:     Entity['rarity'];

    mechanics: string[];
}
