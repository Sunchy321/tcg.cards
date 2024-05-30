export type WithUpdation<T> = T & {
    __updations: {
        key: string;
        partIndex?: number;
        lang?: string;
        oldValue: any;
        newValue: any;
    }[];

    __lockedPaths: string[];
};
