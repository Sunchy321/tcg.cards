import { Schema } from 'mongoose';

export type WithHistory<T> = T & {
    __updations: {
        source: string;
        date: string;
        data: Partial<T>;
    };

    __lockedPaths: string[];
};

export function historyPlugin<T extends WithHistory<any>>(schema: Schema<T>): void {
    schema.pre('save', async () => {

    });
}
