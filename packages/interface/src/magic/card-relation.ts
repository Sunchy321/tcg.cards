export interface CardRelation {
    relation: string;
    sourceId: string;
    targetId: string;
    targetVersion?: {
        set: string;
        number: string;
        lang?: string;
    };
}
