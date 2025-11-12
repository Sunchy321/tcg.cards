import z from 'zod';

type ValueOrArray<T> = T | T[];

export type XTag = {
    _attributes: {
        enumID:  string;
        name:    string;
        type:    'Card' | 'Int' | 'String';
        value:   string;
        cardID?: string;
    };

    _text?: string;
};

export type XLocStringTag = {
    _attributes: {
        enumID: string;
        name:   string;
        type:   'LocString';
    };
} & Record<string, { _text: string }>;

export type XPlayRequirement = {
    _attributes: {
        reqID: string;
        param: string;
    };
};

export type XPower = {
    _attributes: {
        definition: string;
    };

    PlayRequirement: ValueOrArray<XPlayRequirement>;
};

export type XReferencedTag = {
    _attributes: {
        enumID: string;
        name:   string;
        value:  string;
    };
};

export type XEntourageCard = {
    _attributes: {
        cardID: string;
    };
};

export type XMasterPower = {
    _text: string;
};

export type XTriggeredPowerHistoryInfo = {
    _attributes: {
        effectIndex:   string;
        showInHistory: string;
    };
};

export type XEntity = {
    _attributes: {
        CardID:  string;
        ID:      string;
        version: string;
    };

    MasterPower?:               ValueOrArray<XMasterPower>;
    Tag?:                       ValueOrArray<XLocStringTag | XTag>;
    Power?:                     ValueOrArray<XPower>;
    ReferencedTag?:             ValueOrArray<XReferencedTag>;
    EntourageCard?:             ValueOrArray<XEntourageCard>;
    TriggeredPowerHistoryInfo?: ValueOrArray<XTriggeredPowerHistoryInfo>;
};

export type XCardDefs = {
    _attributes: {
        build: string;
    };

    Entity: XEntity[];
};

export const pullRepoProgress = z.strictObject({
    type:      z.literal('get'),
    method:    z.string(),
    stage:     z.string(),
    progress:  z.number().min(0).max(100),
    processed: z.number().nonnegative(),
    total:     z.number().positive(),
});

export const loaderProgress = z.strictObject({
    type:  z.literal('load'),
    count: z.number().int().nonnegative(),
    total: z.number().int().positive(),
});

export const patchProgress = z.strictObject({
    type:    z.enum(['load-patch', 'clear-patch']),
    method:  z.enum(['entity', 'relation']),
    version: z.number().int().positive(),
    count:   z.number().int().nonnegative(),
    total:   z.number().int().positive(),
});

export const clearPatchResult = z.strictObject({
    deletedEntity: z.strictObject({
        cardId: z.string(),
    }).array(),
    deletedEntityLocalization: z.strictObject({
        cardId: z.string(),
    }).array(),
});

export type PullRepoProgress = z.infer<typeof pullRepoProgress>;
export type LoaderProgress = z.infer<typeof loaderProgress>;
export type PatchProgress = z.infer<typeof patchProgress>;
