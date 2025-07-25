import { register } from 'zod-metadata';
import { z } from 'zod';

register(z);

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
