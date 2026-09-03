import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'bun:test';
import { projectCard, type AssembledCard, type ProjectCardResult } from '../../project-card';

const dir = import.meta.dir;
const input = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf8')) as AssembledCard;
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as ProjectCardResult;

test('projection golden: goblin!r-11--dft-one-face', () => {
  expect(projectCard(input)).toEqual(expected);
});
