type ValueOrArray<T> = T | T[];

export type XCardDefs = {
    _attributes: {
        build: string;
    };

    Entity: XEntity[];
};

export type XEntity = {
    _attributes: {
        CardID: string;
        ID: string;
        version: string;
    };

    Tag?: ValueOrArray<XTag | XLocStringTag>;
    Power?: ValueOrArray<XPower>;
    ReferencedCard?: ValueOrArray<XReferencedTag>;
    EntourageCard?: ValueOrArray<XEntourageCard>;
};

export type XTag = {
    _attributes: {
        enumID: string;
        name: string;
        type: 'Int' | 'String' | 'Card';
        value: string;
        cardID?: string;
    };

    _text?: string;
};

export type XLocStringTag = {
    [key: string]: { _text: string };
} & {
    _attributes: {
        enumID: string;
        name: string;
        type: 'LocString';
    };
};

export type XPower = {
    _attributes: {
        definition: string;
    };

    PlayRequirement: ValueOrArray<XPlayRequirement>;
};

export type XPlayRequirement = {
    _attributes: {
        enumID: string;
        reqID: string;
        param: string;
    };
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
        CardID: string;
    };
};
