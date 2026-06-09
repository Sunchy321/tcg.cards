import { describe, expect, test } from 'bun:test';

import { hsdataRepoTestUtils } from './hsdata-repo';

describe('hsdata repo git failures', () => {
  test('reports subprocess errors when git exits without a numeric status', () => {
    const message = hsdataRepoTestUtils.formatGitCommandFailure(
      ['show', 'refs/tags/33402:CardDefs.xml'],
      {
        status: null,
        signal: 'SIGTERM',
        error:  new Error('spawnSync git ENOBUFS'),
        stderr: '',
      },
    );

    expect(message).toBe(
      'git show refs/tags/33402:CardDefs.xml failed: spawnSync git ENOBUFS',
    );
  });

  test('prefers git stderr when the command returned a normal exit status', () => {
    const message = hsdataRepoTestUtils.formatGitCommandFailure(
      ['show', 'refs/tags/missing:CardDefs.xml'],
      {
        status: 128,
        signal: null,
        error:  null,
        stderr: 'fatal: path \'CardDefs.xml\' does not exist in \'refs/tags/missing\'',
      },
    );

    expect(message).toBe(
      'fatal: path \'CardDefs.xml\' does not exist in \'refs/tags/missing\'',
    );
  });
});
