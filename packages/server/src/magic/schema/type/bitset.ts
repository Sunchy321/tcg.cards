import { customType } from 'drizzle-orm/pg-core';

/**
 * Creates a custom bitset field type
 * @param values Value string, e.g. 'WUBRG' or 'WUBRGC'
 * @returns Drizzle custom column type
 */
export function bitset(values: string) {
    const length = values.length;
    const valueArray = values.split('');

    return customType<{
        data:       string;
        driverData: string;
        config:     { dimensions?: number };
    }>({
        dataType(config) {
            const dimensions = config?.dimensions ?? length;
            return `bit(${dimensions})`;
        },

        toDriver(value: string): string {
            const dimensions = this.config?.fieldConfig?.dimensions ?? length;

            const bits = valueArray.map(v => value.includes(v) ? '1' : '0').join('');

            if (bits.length > dimensions) {
                return bits.slice(0, dimensions);
            } else {
                return bits.padEnd(dimensions, '0');
            }
        },

        fromDriver(value: string): string {
            return valueArray
                .filter((v, i) => value[i] === '1')
                .join('');
        },
    });
}

export const color = bitset('WUBRGOP');

export const mana = bitset('WUBRGC');
