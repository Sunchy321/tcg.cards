import { z } from '@model/zod';

type RemoveArray<T> = T extends (infer U)[] ? U : T;

export type InferView<T extends z.ZodType<any, any, any>> = T extends z.ZodType<any, infer B, any>
    ? B extends { meta: { primaryKey: any } } & z.ZodArrayDef
        ? RemoveArray<z.infer<T>>
        : B extends z.ZodObjectDef<infer S>
            ? {
                [K in keyof S]: InferView<S[K]>
            }
            : z.infer<T>
    : never;
