declare module '*.yml' {
    const data: any;
    export default data;
}

declare module 'data/magic/keyword.yml' {
    type KeywordList = {
        keyword: string[];
        keyword_action: string[];
        ability_word: string[];
        keyword_mtga: string[];
        keyword_un: string[];
    };

    const data: KeywordList;
    export default data;
}

declare module 'data/magic/localization/keyword/*.yml' {
    const data: Record<string, string>;
    export default data;
}
