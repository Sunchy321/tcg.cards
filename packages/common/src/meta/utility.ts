export type TupleToArray<T> = T extends any[] ? T[number][] : never;
