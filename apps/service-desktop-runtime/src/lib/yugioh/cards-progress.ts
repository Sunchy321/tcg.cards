import { randomUUID } from 'node:crypto';

import { ORPCError } from '@orpc/server';

/** Current in-memory Yu-Gi-Oh! desktop task snapshot. */
export interface YugiohJobSnapshot {
  jobId: string;
  kind: 'import' | 'image_import' | 'publish';
  status: 'running' | 'completed' | 'failed';
  phase: string;
  message: string;
  completedCount: number | null;
  totalCount: number | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

let currentJob: YugiohJobSnapshot | null = null;

/** Current task snapshot copied for safe RPC serialization. */
export function getCurrentYugiohJob() {
  return currentJob == null ? null : { ...currentJob };
}

/** Current running task updated with one progress event. */
export function updateCurrentYugiohJob(progress: {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}) {
  if (currentJob?.status !== 'running') {
    return;
  }

  currentJob = {
    ...currentJob,
    phase: progress.phase,
    message: progress.message,
    completedCount: progress.completedCount ?? currentJob.completedCount,
    totalCount: progress.totalCount ?? currentJob.totalCount,
    updatedAt: new Date().toISOString(),
  };
}

/** One card import, image import, or publish task executed with concurrency protection and final status. */
export async function runYugiohJob<T>(
  kind: YugiohJobSnapshot['kind'],
  handler: () => Promise<T>,
) {
  if (currentJob?.status === 'running') {
    throw new ORPCError('CONFLICT', {
      message: `Yu-Gi-Oh! ${currentJob.kind} job ${currentJob.jobId} is already running.`,
    });
  }

  const startedAt = new Date().toISOString();
  const startingMessage = kind === 'import'
    ? '正在准备导入…'
    : kind === 'image_import'
      ? '正在准备卡图导入…'
      : '正在准备发布…';

  currentJob = {
    jobId: randomUUID(),
    kind,
    status: 'running',
    phase: 'starting',
    message: startingMessage,
    completedCount: null,
    totalCount: null,
    error: null,
    startedAt,
    updatedAt: startedAt,
    finishedAt: null,
  };

  try {
    const result = await handler();
    const finishedAt = new Date().toISOString();
    const completedMessage = kind === 'import'
      ? '卡牌导入完成。'
      : kind === 'image_import'
        ? '主卡图导入完成。'
        : '测试 remote 发布完成。';

    currentJob = {
      ...currentJob,
      status: 'completed',
      phase: 'completed',
      message: completedMessage,
      updatedAt: finishedAt,
      finishedAt,
    };

    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    currentJob = {
      ...currentJob,
      status: 'failed',
      phase: 'failed',
      message: '任务失败。',
      error: message,
      updatedAt: finishedAt,
      finishedAt,
    };

    throw error;
  }
}
