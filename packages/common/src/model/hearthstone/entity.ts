import { Entity as IEntity } from '@interface/hearthstone/entity';

export type RelatedEntity = {
    relation: string;
    entityId: string;
    version:  number[];
};

export type EntityView = IEntity & {
    versions:     number[][];
    relatedCards: RelatedEntity[];
};
