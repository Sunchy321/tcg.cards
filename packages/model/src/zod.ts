import { register } from 'zod-metadata';
import { z } from 'zod';

register(z);

declare module 'zod' {
    interface ZodMeta {
        type?:       string;
        primaryKey?: string[];
        map?:        string;
    }
}

export { z };
