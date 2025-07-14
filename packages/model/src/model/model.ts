type SimpleModel = {
    type: 'boolean' | 'number' | 'string';
};

type EnumModel = {
    type:   'enum';
    values: string[];
};

type SpecialModel = {
    type: 'id' | 'string-set' | 'numeric' | 'uuid' | 'loose-enum' | 'string-date' | 'url' | 'number-id';
} | EnumModel;

type ObjectModel = {
    type: 'object';

    properties: Record<string, Model & {
        optional?: true;
    }>;
};

type ArrayModel = {
    type:    'array';
    element: Model;
};

type SimpleSetModel = {
    type:    'simple-set';
    element: SimpleModel | SpecialModel;
};

type IndexSetModel = {
    type:    'index-set';
    element: Omit<ObjectModel, 'properties'> & {
        properties: Record<string, ObjectModel['properties'][string] & {
            index?: true;
        }>;
    };
};

type MapModel = {
    type:  'map';
    value: Model;
};

type ArraylikeModel = ArrayModel | SimpleSetModel | IndexSetModel;

type Model = SimpleModel | SpecialModel | ObjectModel | ArraylikeModel | MapModel;

type SimpleModelMap = {
    'boolean': boolean;
    'number':  number;
    'string':  string;

    'id':          string;
    'uuid':        string;
    'string-set':  string;
    'numeric':     number | string;
    'enum':        string;
    'loose-enum':  string;
    'string-date': string;
    'url':         string;
    'number-id':   number;
};

export type IntoType<M extends Model> =
    M extends ObjectModel
        ? { [K in keyof M['properties']]: IntoType<M['properties'][K]>; }
        : M extends ArraylikeModel
            ? IntoType<M['element']>[]
            : M extends MapModel
                ? Record<string, IntoType<M['value']>>
                : M extends EnumModel
                    ? (M['values'] extends [...infer V]
                        ? V[number]
                        : never)
                    : M extends SimpleModel | SpecialModel
                        ? SimpleModelMap[M['type']]
                        : never;

export function defineModel<M extends Model>(model: M): M {
    return model;
}

export function defineEnum<E extends string[]>(...values: E): { type: 'enum', values: E } {
    return {
        type: 'enum',
        values,
    };
};
