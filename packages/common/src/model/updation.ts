export type Updation = {
    key: string;
    oldValue: any;
    newValue: any;
};

export type WithUpdation<T> = T & {
    __updations: Updation[];

    __lockedPaths: string[];
};
