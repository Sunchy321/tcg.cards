declare module '*.yml' {
    const data: any;
    export default data;
}

declare module '@data/magic/keyword.yml' {
    type KeywordList = {
        keyword:        string[];
        keyword_action: string[];
        ability_word:   string[];
        keyword_mtga:   string[];
        keyword_un:     string[];
    };

    const data: KeywordList;
    export default data;
}

declare module '@data/magic/localization/keyword/*.yml' {
    const data: Record<string, string>;
    export default data;
}

declare module '@data/hearthstone/tag/map/mechanic.yml' {
    const data: Record<number, string>;
    export default data;
}

declare module '@data/hearthstone/tag/map/related-entity.yml' {
    const data: Record<number, string>;
    export default data;
}

declare module '@data/hearthstone/tag/field.yml' {
    const data: Record<number, { index: string }>;
    export default data;
}

declare module '@data/hearthstone/tag/localization-field.yml' {
    const data: Record<number, string>;
    export default data;
}
