import type { SearchPackageFile } from './manifest';
import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import type { SearchPublishObject, SearchPublishRemote, SignedSearchUpload } from './remote';

/** What one publication run produced. */
export interface SearchPublicationOutcome {
  mode:            'local' | 'remote';
  uploadedObjects: number;
  reusedObjects:   number;
}

/** Collaborators one publication run needs, so the ordering stays testable. */
export interface SearchPublicationRunner {
  isAccountTarget: boolean;
  manifest:        SearchPublicationManifest;
  files:           SearchPackageFile[];
  remote:          SearchPublishRemote | null;
  /** Uploads one package file to its signed URL. */
  uploadFile(upload: SignedSearchUpload, file: SearchPackageFile, signal?: AbortSignal): Promise<void>;
  /** Uploads one small in-memory object to its signed URL. */
  uploadBuffer(upload: SignedSearchUpload, body: Buffer, signal?: AbortSignal): Promise<void>;
  /** Saves the release description next to the exported packages. */
  writeLocalManifest(): Promise<void>;
  progress(done: number): Promise<void>;
  signal?:         AbortSignal;
}

/** Strips the leading slash the release description uses from a bucket key. */
export function bucketKey(key: string): string {
  return key.replace(/^\/+/, '');
}

/** Serializes one manifest exactly as it is published. */
export function manifestBytes(manifest: SearchPublicationManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Runs one publication: a direct target only writes local files, while an account
 * target uploads packages, verifies them, and only then writes the release
 * description and the mutable pointer that activates it.
 */
export async function runSearchPublication(
  runner: SearchPublicationRunner,
): Promise<SearchPublicationOutcome> {
  if (!runner.isAccountTarget) {
    await runner.writeLocalManifest();
    await runner.progress(1);
    return { mode: 'local', uploadedObjects: 0, reusedObjects: 0 };
  }

  const remote = runner.remote;
  if (!remote) throw new Error('账户发布目标需要先登录控制台服务。');

  const objects: SearchPublishObject[] = runner.files.map(file => ({
    key:    bucketKey(file.key),
    bytes:  file.bytes,
    sha256: file.sha256,
  }));
  const byKey = new Map(runner.files.map(file => [bucketKey(file.key), file]));

  let done = 0;
  const plan = await remote.requestUploads({ game: runner.manifest.game, objects });
  for (const upload of plan.uploads) {
    const file = byKey.get(upload.key);
    if (!file) throw new Error('服务返回了未知的上传对象。');
    await runner.uploadFile(upload, file, runner.signal);
    done += 1;
    await runner.progress(done);
  }

  // Verification runs before any manifest exists, so a failed release never activates.
  const verified = await remote.verify({ game: runner.manifest.game, objects });
  if (!verified.ok) throw new Error('搜索数据校验未通过，已停止发布；请重试后再确认。');

  done = runner.manifest.packages.length;
  await runner.progress(done);

  const bytes = manifestBytes(runner.manifest);
  const immutableKey = bucketKey(`/search/${runner.manifest.game}/releases/${runner.manifest.releaseHash}/manifest.json`);
  const pointerKey = bucketKey(`/search/${runner.manifest.game}/manifest.json`);

  for (const key of [immutableKey, pointerKey]) {
    const manifestPlan = await remote.requestUploads({
      game:    runner.manifest.game,
      objects: [{ key, bytes: bytes.byteLength }],
    });
    for (const upload of manifestPlan.uploads) {
      await runner.uploadBuffer(upload, bytes, runner.signal);
    }
    done += 1;
    await runner.progress(done);
  }

  await runner.writeLocalManifest();
  return {
    mode:            'remote',
    uploadedObjects: plan.uploads.length,
    reusedObjects:   plan.existing.length,
  };
}
