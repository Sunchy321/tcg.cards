export type Updation = {
    key:      string;
    oldValue: any;
    newValue: any;
};

export type WithUpdation<T> = T & {
    cardId: string;

    __updations: Updation[];

    __lockedPaths: string[];
};

export function defaultToJSON(doc: any, ret: any): any {
    delete ret._id;
    delete ret.__v;
    delete ret.__lockedPaths;
    delete ret.__updations;

    return ret;
}
