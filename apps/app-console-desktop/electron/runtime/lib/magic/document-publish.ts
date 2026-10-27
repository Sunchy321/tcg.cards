import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { publishDocument, publishStaticDocuments } from '@tcg-cards/console-api/lib/magic/documents/publish';
import { getLocalDb, requireLocalDatabaseUrl } from '../hearthstone/hsdata-local-db';
import { resolveHearthstonePublishTarget as resolvePublishTarget } from '../runtime/desktop-database';
import { requireMagicPublishTargetByIdentity } from './magic-publish-target';

/** Pins the selected destination independently of the current desktop configuration. */
export interface DocumentPublication {
  publishTarget:      string;
  environment:        string;
  targetFingerprint?: string;
  dryRun?:            boolean;
}

/** Publishes saved static articles only after verifying the configured live destination. */
export async function publishDocuments(input: DocumentPublication, documentId?: string) {
  let target;
  try {
    target = requireMagicPublishTargetByIdentity(input.publishTarget, input.environment);
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', { message: '未配置所选发布环境，请检查发布配置。', cause: error });
  }
  if (input.targetFingerprint != null && input.targetFingerprint !== target.targetFingerprint) {
    throw new ORPCError('BAD_REQUEST', { message: '发布目标配置已变更，请刷新配置后重新发布。' });
  }
  let live;
  try {
    live = await resolvePublishTarget(target);
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', { message: '无法连接发布目标，请检查发布配置后重试。', cause: error });
  }
  if (live.targetFingerprint !== target.targetFingerprint) {
    throw new ORPCError('BAD_REQUEST', { message: '发布目标与保存的配置不一致，请重新确认发布配置。' });
  }
  let local;
  try {
    local = await resolvePublishTarget({ ...target, connectionString: requireLocalDatabaseUrl() });
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', { message: '无法连接本地数据库，请检查本地数据库配置。', cause: error });
  }
  // Separate connections to one database would wait on each other's publication locks.
  if (local.databaseName === live.databaseName && local.serverHost === live.serverHost && local.serverPort === live.serverPort) {
    throw new ORPCError('BAD_REQUEST', { message: '发布目标不能是当前本地数据库，请选择远端发布环境。' });
  }
  const remote = createDb(target.connectionString);
  try {
    const source = createDocumentStore(getLocalDb(), 'local');
    const destination = createDocumentStore(remote, 'remote');
    const options = { dryRun: input.dryRun ?? false };
    const counts = documentId == null
      ? await publishStaticDocuments(source, destination, options)
      : await publishDocument(source, destination, documentId, options);
    return { ...counts, dryRun: options.dryRun };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'No static documents available to publish' || message === 'Document not found') {
      throw new ORPCError('BAD_REQUEST', { message: '没有可发布的静态文档，请先导入文档。', cause: error });
    }
    if (/collid|conflict|overwrite|replace an existing/.test(message)) {
      throw new ORPCError('CONFLICT', { message: '发布内容与目标中的现有文章或版本冲突，本次发布未写入。', cause: error });
    }
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '静态文档发布失败，请检查数据库连接后重试。', cause: error });
  } finally {
    await remote.$client.end({ timeout: 1 });
  }
}
