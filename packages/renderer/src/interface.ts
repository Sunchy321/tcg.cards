import { Entity } from '@interface/hearthstone/entity';

export interface EntityRenderData {
    variant: 'diamond' | 'golden' | 'normal';
    costType: 'coin' | 'mana' | 'speed';

    lang: string;
    name: string;
    text: string;
    rawText: string;
    illusId?: string;

    classes: Entity['classes'];
    cardType: Entity['cardType'];
    cost?: Entity['cost'];
    attack?: Entity['attack'];
    health?: Entity['health'];
    durability?: Entity['durability'];
    armor?: Entity['armor'];
    race?: Entity['race'];
    spellSchool?: Entity['spellSchool'];
}
