import { describe, expect, test } from 'bun:test';

import { parseNumberInput } from './import-numbers';

describe('parseNumberInput', () => {
  test('reads a single number', () => {
    expect(parseNumberInput('123')).toEqual(['123']);
    expect(parseNumberInput('  123  ')).toEqual(['123']);
  });

  test('reads comma-separated items', () => {
    expect(parseNumberInput('1,2,3,4')).toEqual(['1', '2', '3', '4']);
    expect(parseNumberInput('1, 2, 3')).toEqual(['1', '2', '3']);
    expect(parseNumberInput('1,2,3,')).toEqual(['1', '2', '3']);
  });

  test('accepts the full-width comma and whitespace as separators', () => {
    expect(parseNumberInput('1,2,3')).toEqual(['1', '2', '3']);
    expect(parseNumberInput('1\uff0c2\uff0c3')).toEqual(['1', '2', '3']);
    expect(parseNumberInput('1 2\n3')).toEqual(['1', '2', '3']);
  });

  test('reads a span written with spaces around the hyphen', () => {
    expect(parseNumberInput('1 - 3')).toEqual(['1', '2', '3']);
    expect(parseNumberInput('001 - 003, 7')).toEqual(['001', '002', '003', '7']);
  });

  test('expands a span inclusive', () => {
    expect(parseNumberInput('1-4')).toEqual(['1', '2', '3', '4']);
    expect(parseNumberInput('3-3')).toEqual(['3']);
  });

  test('expands a span in the written direction', () => {
    expect(parseNumberInput('3-1')).toEqual(['3', '2', '1']);
  });

  test('keeps zero padding at the padded endpoint width', () => {
    expect(parseNumberInput('001-004')).toEqual(['001', '002', '003', '004']);
    expect(parseNumberInput('001-4')).toEqual(['001', '002', '003', '004']);
    expect(parseNumberInput('1-004')).toEqual(['001', '002', '003', '004']);
    expect(parseNumberInput('09-10')).toEqual(['09', '10']);
  });

  test('adds no padding to a range written without it', () => {
    expect(parseNumberInput('9-10')).toEqual(['9', '10']);
    expect(parseNumberInput('8-11')).toEqual(['8', '9', '10', '11']);
  });

  test('mixes spans and items in one value', () => {
    expect(parseNumberInput('1-3, 7, 9-10')).toEqual(['1', '2', '3', '7', '9', '10']);
  });

  test('keeps numbers that are not pure digits literal', () => {
    expect(parseNumberInput('A-1')).toEqual(['A-1']);
    expect(parseNumberInput('100a-102a')).toEqual(['100a-102a']);
    expect(parseNumberInput('★-1')).toEqual(['★-1']);
    expect(parseNumberInput('1-a')).toEqual(['1-a']);
    expect(parseNumberInput('1-100a')).toEqual(['1-100a']);
  });

  test('drops duplicates while keeping the first occurrence order', () => {
    expect(parseNumberInput('2,1-3,2')).toEqual(['2', '1', '3']);
  });

  test('returns nothing for an empty value', () => {
    expect(parseNumberInput('')).toEqual([]);
    expect(parseNumberInput('  ,  ')).toEqual([]);
  });
});
