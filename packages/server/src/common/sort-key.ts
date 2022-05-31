import { Type, Property, getType } from 'tst-reflect';

function getProperty(type: Type, key: string): Property | null {
    if (type.isIntersection()) {
        for (const t of type.types) {
            const property = getProperty(t, key);

            if (property != null) {
                return property;
            }
        }

        return null;
    }

    const properties = type.getProperties();

    for (const p of properties) {
        if (p.name === key) {
            return p;
        }
    }

    return null;
}

function sortKeyDetail(value: any, type: Type): any {
    if (Array.isArray(value)) {
        const elemType = type.getTypeArguments()[0];

        if (elemType != null) {
            return value.map((v: any) => sortKeyDetail(v, type.getTypeArguments()[0]));
        }

        return value;
    }

    if (typeof value !== 'object' || value == null) {
        return value;
    }

    const keys = Object.keys(type.flattenInheritedMembers().properties);

    return Object.fromEntries(
        Object
            .entries(value)
            .sort((a, b) => keys.indexOf(a[0]) - keys.indexOf(b[0]))
            .map(([k, v]) => {
                const p = getProperty(type, k);

                if (p != null) {
                    return [k, sortKeyDetail(v, p.type)];
                }

                return [k, v];
            }),
    ) as any;
}

export default function sortKey<T>(value: T): T {
    const type = getType<T>();

    return sortKeyDetail(value, type);
}
