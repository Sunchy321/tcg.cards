export type ResultPattern<P> = [P] extends [never]
    ? never
    : P extends string
        ? [P]
        : P extends [...any]
            ? P
            : never;

export type SinglePatternKeys<P> = P extends `${any}{{${infer Param}}}${infer Suffix}`
    ? ([SinglePatternKeys<Suffix>] extends [never]
        ? Param
        : Param | SinglePatternKeys<Suffix>
    )
    : never;

export type PatternKeys<P> = P extends string
    ? SinglePatternKeys<P>
    : P extends [infer U]
        ? SinglePatternKeys<U>
        : P extends [infer U, ...infer V]
            ? PatternKeys<V> & SinglePatternKeys<U>
            : never;

export type IsPattern<P> = [PatternKeys<P>] extends [never] ? false : true;

export type PatternContext<P> = [PatternKeys<P>] extends [never] ? never : { [K in PatternKeys<P>]: string };
