export interface IFormat {
    formatId: string;

    localized: Array<{
        lang: string;
        name: string;
    }>;

    sets: Array<{
        id: string;
        enterTime: Date;
        leaveTime: Date;
    }>;

    // banlist: Array<{
    //     cardId: string;
    // }>
}
