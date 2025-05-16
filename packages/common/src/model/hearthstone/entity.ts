import { Entity as IEntity } from '@interface/hearthstone/entity';

export type RelatedCard = {
    relation: string;
    cardId:   string;
    version:  number[];
};

export type EntityView = IEntity & {
    versions:     number[][];
    relatedCards: RelatedCard[];
};
