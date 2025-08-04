import _ from 'lodash';

export function toIdentifier(text: string): string {
    return _.deburr(text)
        .trim()
        .toLowerCase()
        .replace(/ \/\/ /g, '____')
        .replace(/\/(?!mog$)/, '____')
        .replace(/[^a-z0-9]/g, '_');
}
