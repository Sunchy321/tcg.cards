type T = {
    a: 1;
};

type IndexKey<T> = {
    [K in keyof T]: T[K] extends number | string ? K : never;
}[keyof T];
