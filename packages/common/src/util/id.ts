import { deburr } from 'lodash';

export function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(/ \/\/ /g, '____')
        .replace(/\/(?!mog$)/, '____')
        .replace(/[^a-z0-9]/g, '_');
}
