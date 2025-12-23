export type HiddenKeys<T> = keyof T;

export type Hide<T, Called extends HiddenKeys<T>> = Omit<T, Called>;
