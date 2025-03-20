import { RawItem } from '../parser';
import transform, { LogItem, RawEntity } from './index';

export type EntityAvatar =
  { avatar: 'game' } |
  { avatar: 'player', name: string } |
  RawEntity & { avatar: 'normal' };

export type Tag = {
    tag:   string;
    value: string;
};

export type GameEntity = {
    type:   'GameEntity';
    entity: RawEntity;
};

export type PlayerEntity = {
    type:   'PlayerEntity';
    entity: RawEntity;
};

export type CreateGame = {
    type:    'CreateGame';
    game:    GameEntity;
    player1: PlayerEntity;
    player2: PlayerEntity;
};

export type CreateEntity = {
    type:   'CreateEntity';
    entity: RawEntity;
};

export type UpdateEntity = {
    type:    'UpdateEntity';
    entity:  EntityAvatar;
    cardId:  string;
    updated: RawEntity;
};

export type ShowEntity = {
    type:   'ShowEntity';
    entity: EntityAvatar;
    cardId: string;
    detail: RawEntity;
};

export type HideEntity = {
    type:   'HideEntity';
    entity: EntityAvatar;
    tag:    string;
    value:  string;
};

export type TagChange = {
    type:   'TagChange';
    entity: EntityAvatar;
    tag:    string;
    value:  string;
};

export type Block = {
    type:            'Block';
    blockType:       string;
    entity:          EntityAvatar;
    effectIndex:     number;
    target:          EntityAvatar | null;
    subOption:       number;
    triggerKeyword?: string;
    content:         LogItem[];
};

export type BlockEnd = {
    type: 'BlockEnd';
};

export type MetaData = {
    type:  'MetaData';
    meta:  string;
    data:  number;
    infos: EntityAvatar[];
};

export type FullEntity = CreateEntity | UpdateEntity;

export type CommonItem =
  Block | BlockEnd | CreateGame | FullEntity | GameEntity |
  HideEntity | MetaData | PlayerEntity | ShowEntity | TagChange;

export function withMethod<T, U>(object: T | null, method: U): (T & { method: U }) | null {
    return object != null ? { method, ...object } : null;
}

export function underScoreToCamelCase(text: string): string {
    return text
        .replace(/(?<!_)[A-Z]/g, v => v.toLowerCase())
        .replace(/_/g, '');
}

export function parseEntity(entity: string): EntityAvatar | null {
    if (entity === 'GameEntity') {
        return { avatar: 'game' };
    } else if (/^.*#.*$/.test(entity)) {
        return { avatar: 'player', name: entity };
    } else if (entity.startsWith('[') && entity.endsWith(']')) {
        const m = /^\[entityName=(.*) id=(.*) zone=(.*) zonePos=(.*) cardId=(.*) player=(.*)\]$/.exec(entity);

        if (m == null) { return null; }

        const [_, name, entityId, zone, zonePos, cardId, player] = m;

        return {
            avatar: 'normal',
            name,
            entityId,
            zone,
            zonePos,
            cardId,
            player,
        };
    } else if (/^\d+$/.test(entity)) {
        return { avatar: 'normal', entityId: Number.parseInt(entity, 10) };
    } else {
        return null;
    }
}

export function parseTag(item: RawItem): Tag | null {
    const m = /^tag=([^ ]+) value=([^ ]+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, tagText, valueText] = m;

    const tag = underScoreToCamelCase(tagText);

    const value = underScoreToCamelCase(valueText);

    return { tag, value };
}

export function transformGameEntity(item: RawItem): GameEntity | null {
    if (item.children == null) { return null; }

    const children = item.children.map(parseTag);

    const m = /^GameEntity EntityID=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const entity: RawEntity = { entityId: m[1] };

    for (const c of children) {
        if (c == null) { return null; }

        entity[c.tag] = c.value;
    }

    return {
        type: 'GameEntity',
        entity,
    };
}

export function transformPlayerEntity(item: RawItem): PlayerEntity | null {
    if (item.children == null) { return null; }

    const children = item.children.map(parseTag);

    const m = /^Player EntityID=(\d+) PlayerID=(\d+) GameAccountId=\[hi=(\d+) lo=(\d+)\]$/.exec(item.text);

    if (m == null) { return null; }

    const [_, entityId, playerId, hi, lo] = m;

    const entity: RawEntity = { entityId, playerId, gameAccountId: { hi, lo } };

    for (const c of children) {
        if (c == null) { return null; }

        entity[c.tag] = c.value;
    }

    return {
        type: 'PlayerEntity',
        entity,
    };
}

export function transformCreateGame(item: RawItem): CreateGame | null {
    if (item.children == null || item.children.length !== 3) {
        return null;
    }

    const [game, player1, player2] = transform(item.children);

    if (game.type !== 'GameEntity') { return null; }
    if (player1.type !== 'PlayerEntity') { return null; }
    if (player2.type !== 'PlayerEntity') { return null; }

    return {
        type: 'CreateGame',
        game,
        player1,
        player2,
    };
}

export function transformCreateEntity(item: RawItem): CreateEntity | null {
    const children = (item.children ?? []).map(parseTag);

    const m = /^FULL_ENTITY - Creating ID=(\d+) CardID=(.*)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, entityId, cardId] = m;

    const entity: RawEntity = { entityId };

    if (cardId !== '') {
        entity.cardId = cardId;
    }

    for (const c of children) {
        if (c == null) { return null; }

        entity[c.tag] = c.value;
    }

    return {
        type: 'CreateEntity',
        entity,
    };
}

export function transformUpdateEntity(item: RawItem): UpdateEntity | null {
    const children = (item.children ?? []).map(parseTag);

    const m1 = /^FULL_ENTITY - Updating (.*) CardID=(.*)$/.exec(item.text);

    if (m1 == null) { return null; }

    const [_, entityText, cardId] = m1;

    const entity = parseEntity(entityText);

    if (entity == null) { return null; }

    const updated: RawEntity = { };

    for (const c of children) {
        if (c == null) { return null; }

        updated[c.tag] = c.value;
    }

    return {
        type: 'UpdateEntity',
        entity,
        cardId,
        updated,
    };
}

export function transformShowEntity(item: RawItem): ShowEntity | null {
    const children = (item.children ?? []).map(parseTag);

    const m1 = /^SHOW_ENTITY - Updating Entity=(.*) CardID=(.*)$/.exec(item.text);

    if (m1 == null) { return null; }

    const [_, entityText, cardId] = m1;

    const entity = parseEntity(entityText);

    if (entity == null) { return null; }

    const detail: RawEntity = { };

    for (const c of children) {
        if (c == null) { return null; }

        detail[c.tag] = c.value;
    }

    return {
        type: 'ShowEntity',
        entity,
        cardId,
        detail,
    };
}

export function transformHideEntity(item: RawItem): HideEntity | null {
    const m = /^HIDE_ENTITY - Entity=(.*) tag=(.*) value=(.*)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, entityText, tagText, valueText] = m;

    const entity = parseEntity(entityText);
    const tag = underScoreToCamelCase(tagText);
    const value = underScoreToCamelCase(valueText);

    if (entity == null) { return null; }

    return {
        type: 'HideEntity',
        entity,
        tag,
        value,
    };
}

export function transformFullEntity(item: RawItem): FullEntity | null {
    if (item.text.startsWith('FULL_ENTITY - Creating')) {
        return transformCreateEntity(item);
    } else if (item.text.startsWith('FULL_ENTITY - Updating')) {
        return transformUpdateEntity(item);
    } else {
        return null;
    }
}

export function transformTagChange(item: RawItem): TagChange | null {
    const m = /^TAG_CHANGE Entity=(.*) tag=(.*) value=(.*)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, entityText, tag, value] = m;

    const entity = parseEntity(entityText);

    if (entity == null) { return null; }

    return {
        type: 'TagChange',
        entity,
        tag,
        value,
    };
}

export function transformBlock(item: RawItem): Block | null {
    const content = transform(item.children ?? []);

    const m = /^BLOCK_START BlockType=(.*) Entity=(.*) EffectCardId=(.*) EffectIndex=(-?\d+) Target=(.*) SubOption=(-?\d+)(?: TriggerKeyword=(.*))?$/.exec(item.text);

    if (m == null) { return null; }

    const [_, blockTypeText, entityText, __, effectIndexText, targetText, subOptionText, triggerKeyword] = m;

    const blockType = underScoreToCamelCase(blockTypeText);
    const entity = parseEntity(entityText);
    const effectIndex = Number.parseInt(effectIndexText, 10);
    const target = parseEntity(targetText);
    const subOption = Number.parseInt(subOptionText, 10);

    if (entity == null || target == null) { return null; }

    return {
        type: 'Block',
        blockType,
        entity,
        effectIndex,
        target,
        subOption,
        triggerKeyword,
        content,
    };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function transformBlockEnd(item: RawItem): BlockEnd {
    return { type: 'BlockEnd' };
}

export function transformMetaData(item: RawItem): MetaData | null {
    const m = /^META_DATA - Meta=(.*) Data=(\d+) InfoCount=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, metaText, dataText, infoCountText] = m;

    const meta = underScoreToCamelCase(metaText);
    const data = Number.parseInt(dataText, 10);
    const infoCount = Number.parseInt(infoCountText, 10);

    if (infoCount !== item.children?.length) { return null; }

    const infos = [];

    for (const c of item.children) {
        const mc = /^Info\[\d+\] = (.*)$/.exec(c.text);

        if (mc == null) { return null; }

        const entity = parseEntity(mc[1]);

        if (entity == null) { return null; }

        infos.push(entity);
    }

    return {
        type: 'MetaData',
        meta,
        data,
        infos,
    };
}

export function transformCommon(item: RawItem): CommonItem | null {
    if (item.text.startsWith('CREATE_GAME')) {
        return transformCreateGame(item);
    } else if (item.text.startsWith('GameEntity')) {
        return transformGameEntity(item);
    } else if (item.text.startsWith('Player')) {
        return transformPlayerEntity(item);
    } else if (item.text.startsWith('FULL_ENTITY')) {
        return transformFullEntity(item);
    } else if (item.text.startsWith('SHOW_ENTITY')) {
        return transformShowEntity(item);
    } else if (item.text.startsWith('HIDE_ENTITY')) {
        return transformHideEntity(item);
    } else if (item.text.startsWith('TAG_CHANGE')) {
        return transformTagChange(item);
    } else if (item.text.startsWith('BLOCK_START')) {
        return transformBlock(item);
    } else if (item.text.startsWith('BLOCK_END')) {
        return transformBlockEnd(item);
    } else if (item.text.startsWith('META_DATA')) {
        return transformMetaData(item);
    } else {
        return null;
    }
}
