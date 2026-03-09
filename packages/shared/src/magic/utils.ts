import { deburr } from 'lodash-es';

export function toIdentifier(text: string): string {
  return deburr(text)
    .trim()
    .toLowerCase()
    .replace(/ \/\/ /g, '____')
    .replace(/\/(?!mog$)/, '____')
    .replace(/[^a-z0-9]/, '_');
}
