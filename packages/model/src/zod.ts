import { z } from 'zod';

declare module 'zod' {
    interface ZodMeta {
        type?:       string;
        primary?:    boolean;
        foreign?:    boolean;
        map?:        string;
        primaryKey?: string[];
        colName?:    string;
    }
}

export { z };
