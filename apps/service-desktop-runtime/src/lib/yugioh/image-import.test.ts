import { describe, expect, test } from 'bun:test';

import {
  decideImageImportAction,
  shouldSoftDeletePrimaryImage,
} from './image-import';

describe('decideImageImportAction', () => {
  test('adds the first primary image and skips only a complete verified retry', () => {
    expect(decideImageImportAction({
      hasDomainImage: false,
      domainImageActive: false,
      mappingMatches: false,
      localAssetValid: false,
    })).toBe('added');
    expect(decideImageImportAction({
      hasDomainImage: true,
      domainImageActive: true,
      mappingMatches: true,
      localAssetValid: true,
    })).toBe('skipped');
  });

  test('updates changed, soft-deleted, missing, or corrupt local assets', () => {
    expect(decideImageImportAction({
      hasDomainImage: true,
      domainImageActive: true,
      mappingMatches: false,
      localAssetValid: true,
    })).toBe('updated');
    expect(decideImageImportAction({
      hasDomainImage: true,
      domainImageActive: false,
      mappingMatches: true,
      localAssetValid: true,
    })).toBe('updated');
    expect(decideImageImportAction({
      hasDomainImage: true,
      domainImageActive: true,
      mappingMatches: true,
      localAssetValid: false,
    })).toBe('updated');
  });
});

describe('shouldSoftDeletePrimaryImage', () => {
  test('soft-deletes only active mappings absent from both the source and replacement card match', () => {
    expect(shouldSoftDeletePrimaryImage({
      mappingActive: true,
      sourceRecordMatched: false,
      cardMatched: false,
    })).toBe(true);
    expect(shouldSoftDeletePrimaryImage({
      mappingActive: false,
      sourceRecordMatched: false,
      cardMatched: false,
    })).toBe(false);
    expect(shouldSoftDeletePrimaryImage({
      mappingActive: true,
      sourceRecordMatched: true,
      cardMatched: false,
    })).toBe(false);
    expect(shouldSoftDeletePrimaryImage({
      mappingActive: true,
      sourceRecordMatched: false,
      cardMatched: true,
    })).toBe(false);
  });
});
