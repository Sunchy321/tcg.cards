export type Updation = {
    key: string;
    oldValue: any;
    newValue: any;
};

export type WithUpdation<T> = T & {
    cardId: string;

    __updations: Updation[];

    __lockedPaths: string[];
};
