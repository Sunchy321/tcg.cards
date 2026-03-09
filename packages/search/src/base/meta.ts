export type MetaBase = Record<string, any>;

export type MetaRest<MetaInput extends MetaBase, MetaValue extends MetaBase> = Omit<MetaInput, keyof MetaValue> & Partial<MetaValue>;
