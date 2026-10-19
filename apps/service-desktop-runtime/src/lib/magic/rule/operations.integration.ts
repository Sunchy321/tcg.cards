import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLocalDb } from '../../hearthstone/hsdata-local-db';
import { applyPathOverrides, setLocalDatabaseUrlOverride } from '../../../runtime-config';
import { magicRuleRouter } from '../../../orpc/magic-rule';

// Use only an explicitly supplied, prepared test database, never desktop settings.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL)('desktop RPC imports and lists CR editions through PostgreSQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-rpc-'));
  const source = 'Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of September 1, 2026.\n\nIntroduction\n\nA desktop import test.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n';
  setLocalDatabaseUrlOverride(process.env.DOCUMENT_TEST_LOCAL_URL!);
  applyPathOverrides({ 'magic.image.rule': root });
  try {
    await mkdir(join(root, 'txt'));
    await writeFile(join(root, 'txt', '2026-09-01.txt'), `\uFEFF${source.replaceAll('\n', '\r\n')}`);
    const imported = await magicRuleRouter.importVersion.callable()({ version: '2026-09-01' });
    expect(imported.totalNodes).toBe(5);
    expect(await magicRuleRouter.importVersion.callable()({ version: '2026-09-01' })).toEqual(imported);
    expect((await magicRuleRouter.listLocal.callable()()).find(row => row.date === '2026-09-01')).toMatchObject({
      imported: true, totalNodes: 5, releaseId: imported.releaseId,
    });
    const page = await magicRuleRouter.releases.callable()({ slug: 'magic-cr', versionTag: '20260901' });
    expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');

    await writeFile(join(root, 'txt', '2026-09-01.txt'), source.replace('{W}', '{U}'));
    await expect(magicRuleRouter.importVersion.callable()({ version: '2026-09-01' })).rejects.toMatchObject({
      code: 'BAD_REQUEST', message: '此版本已导入，当前文件内容与已导入内容不同。',
    });
    await expect(magicRuleRouter.importVersion.callable()({ version: '2026-08-01' })).rejects.toMatchObject({
      code: 'BAD_REQUEST', message: '未找到该版本的 TXT 文件，请先下载规则。',
    });
    expect((await magicRuleRouter.releases.callable()({ slug: 'magic-cr', versionTag: '20260901' }))
      .sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
  } finally {
    applyPathOverrides({});
    setLocalDatabaseUrlOverride(null);
    await closeLocalDb();
    await rm(root, { recursive: true, force: true });
  }
});
