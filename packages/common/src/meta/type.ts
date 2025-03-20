import { Primitive as P } from 'ts-essentials';

export type Primitive = P;

export type Fundamental = Primitive | ((...args: any[]) => any);

export function isPrimitive(value: any): value is Primitive {
    return value == null
      || ['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof value);
}

export function isFundamental(value: any): value is Fundamental {
    return isPrimitive(value) || typeof value === 'function';
}

export function isPrimitiveArray(value: any): value is Primitive[] {
    return Array.isArray(value) && value.every(isPrimitive);
}

export function isFundamentalArray(value: any): value is Fundamental[] {
    return Array.isArray(value) && value.every(isFundamental);
}
