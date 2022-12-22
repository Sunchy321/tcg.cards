type ValueOrArray<T> = T | T[];

export type XTag = {
    _attributes: {
        enumID: string;
        name: string;
        type: 'Card' | 'Int' | 'String';
        value: string;
        cardID?: string;
    };

    _text?: string;
};

export type XLocStringTag = {
    _attributes: {
        enumID: string;
        name: string;
        type: 'LocString';
    };
} & {
    [key: string]: { _text: string };
};

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
        name: string;
        value: string;
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
        effectIndex: string;
        showInHistory: string;
    };
};

export type XEntity = {
    _attributes: {
        CardID: string;
        ID: string;
        version: string;
    };

    MasterPower?: ValueOrArray<XMasterPower>;
    Tag?: ValueOrArray<XLocStringTag | XTag>;
    Power?: ValueOrArray<XPower>;
    ReferencedTag?: ValueOrArray<XReferencedTag>;
    EntourageCard?: ValueOrArray<XEntourageCard>;
    TriggeredPowerHistoryInfo?: ValueOrArray<XTriggeredPowerHistoryInfo>;
};

export type XCardDefs = {
    _attributes: {
        build: string;
    };

    Entity: XEntity[];
};
