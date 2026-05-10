import { describe, expect, test } from 'bun:test';

import {
  computeHsdataManifestHash,
  type CreateHsdataImportJobInput,
  normalizeHsdataImportJobStatus,
  validateHsdataImportManifest,
} from './hsdata-import-job';
import { getHsdataImportJobErrorCode } from './hsdata-import-job-error';

/** Minimal valid job manifest used by import job protocol tests. */
function createManifestInput(
  overrides: Partial<CreateHsdataImportJobInput> = {},
): CreateHsdataImportJobInput {
  return {
    sourceTag:            1000,
    sourceCommit:         'abcdef1234567890',
    sourceUri:            'git+local://hsdata?ref=tag:1000&path=CardDefs.xml',
    build:                1000,
    sourceHash:           'source-hash',
    chunkingVersion:      'desktop-v1',
    payloadFormatVersion: 'snapshot-ndjson-v1',
    payloadEncoding:      'gzip',
    importEngineVersion:  'desktop-rust-v1',
    maxBytesPerChunk:     1024 * 1024,
    maxEntitiesPerChunk:  256,
    dryRun:               false,
    force:                false,
    totalChunkCount:      2,
    totalEntityCount:     3,
    chunks:               [
      {
        chunkIndex:  0,
        payloadHash: 'payload-hash-0',
        entityCount: 1,
      },
      {
        chunkIndex:  1,
        payloadHash: 'payload-hash-1',
        entityCount: 2,
      },
    ],
    ...overrides,
  };
}

describe('hsdata import job manifest', () => {
  test('accepts a valid staged import manifest', () => {
    expect(() => validateHsdataImportManifest(createManifestInput())).not.toThrow();
  });

  test('computes the same hash for manifests that only differ by chunk ordering', () => {
    const left = createManifestInput();
    const right = createManifestInput({
      chunks: [...left.chunks].reverse(),
    });

    expect(computeHsdataManifestHash(left)).toBe(computeHsdataManifestHash(right));
  });

  test('rejects unsupported payload metadata', () => {
    expect(() => validateHsdataImportManifest(createManifestInput({
      payloadFormatVersion: 'snapshot-ndjson-v2',
    }))).toThrow('unsupported payloadFormatVersion snapshot-ndjson-v2');

    expect(() => validateHsdataImportManifest(createManifestInput({
      payloadEncoding: 'br',
    }))).toThrow('unsupported payloadEncoding br');
  });

  test('rejects non-contiguous chunk indexes', () => {
    expect(() => validateHsdataImportManifest(createManifestInput({
      chunks: [
        {
          chunkIndex:  0,
          payloadHash: 'payload-hash-0',
          entityCount: 1,
        },
        {
          chunkIndex:  2,
          payloadHash: 'payload-hash-2',
          entityCount: 2,
        },
      ],
    }))).toThrow('chunkIndex values must be unique and contiguous');
  });

  test('rejects inconsistent total counts', () => {
    expect(() => validateHsdataImportManifest(createManifestInput({
      totalChunkCount: 3,
    }))).toThrow('totalChunkCount must equal chunks.length');

    expect(() => validateHsdataImportManifest(createManifestInput({
      totalEntityCount: 4,
    }))).toThrow('totalEntityCount must equal the sum of chunks.entityCount');
  });
});

describe('getHsdataImportJobErrorCode', () => {
  test('maps missing jobs to NOT_FOUND', () => {
    expect(getHsdataImportJobErrorCode('hsdata import job abc does not exist')).toBe('NOT_FOUND');
    expect(getHsdataImportJobErrorCode('chunk 1 is not registered for job abc')).toBe('NOT_FOUND');
  });

  test('maps runtime state conflicts to CONFLICT', () => {
    expect(getHsdataImportJobErrorCode('sourceTag 1000 already has an active import job')).toBe('CONFLICT');
    expect(getHsdataImportJobErrorCode('job abc cannot be finalized from status uploading')).toBe('CONFLICT');
  });

  test('keeps validation failures as BAD_REQUEST', () => {
    expect(getHsdataImportJobErrorCode('unsupported payloadEncoding br')).toBe('BAD_REQUEST');
  });
});

describe('normalizeHsdataImportJobStatus', () => {
  test('promotes uploading jobs once every chunk is completed', () => {
    expect(normalizeHsdataImportJobStatus({
      status:               'uploading',
      totalChunkCount:      2,
      completedChunkCount:  2,
      failedChunkCount:     0,
      processingChunkCount: 0,
    })).toBe('ready_to_finalize');
  });

  test('keeps uploading jobs open while chunks are still in flight', () => {
    expect(normalizeHsdataImportJobStatus({
      status:               'uploading',
      totalChunkCount:      2,
      completedChunkCount:  2,
      failedChunkCount:     0,
      processingChunkCount: 1,
    })).toBe('uploading');
  });
});
