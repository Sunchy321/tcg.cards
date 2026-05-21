import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { ORPCError } from '@orpc/server';

import { readHsdataRepoPath } from '../../runtime-config';

/** Supported hsdata source kinds returned by the desktop runtime repository scan. */
export type HsdataSourceKind = 'tag' | 'worktree';

/** One hsdata source entry listed from the configured local repository. */
export interface HsdataFile {
  id: string;
  name: string;
  kind: HsdataSourceKind;
  size: number;
  time?: string;
  sourceTag?: number;
  sourceCommit: string;
  shortCommit: string;
  sourceUri: string;
}

/** One hsdata source resolved into XML content from the configured local repository. */
export interface HsdataResolvedSource extends HsdataFile {
  xml: string;
  sourceTag: number;
}

/** Repo state returned to the desktop frontend. */
export interface HsdataRepoState {
  repoPath?: string;
}

/** Git fetch summary returned after refreshing remote tags. */
export interface HsdataSyncResult {
  repoPath: string;
  remote: string;
}

/** Parsed metadata from one git tag reference line. */
interface HsdataTagRefMeta {
  tagRef: string;
  tag: string;
  time?: string;
  sourceCommit: string;
}

/** Git blob existence and size resolved through batch cat-file output. */
interface HsdataBlobCheck {
  size?: number;
}

const hsdataRemoteName = 'origin';

/** Trims one optional string into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Returns the short commit text shown in the desktop source list. */
const shortCommit = (commit: string) => {
  return commit.slice(0, 7);
};

/** Builds one stable local git URI for CardDefs.xml at one repository ref. */
const buildSourceUri = (reference: string) => {
  return `git+local://hsdata?ref=${reference}&path=CardDefs.xml`;
};

/** Parses one CardDefs build attribute from the XML root element. */
const parseCardDefsBuild = (xml: string) => {
  const start = xml.indexOf('<CardDefs');
  if (start < 0) {
    throw new Error('Failed to locate CardDefs root element');
  }

  const remaining = xml.slice(start);
  const end = remaining.indexOf('>');
  if (end < 0) {
    throw new Error('Failed to parse CardDefs root element');
  }

  const root = remaining.slice(0, end);
  const match = root.match(/\bbuild="(\d+)"/);
  if (!match) {
    throw new Error('Missing CardDefs.build attribute');
  }

  const build = Number(match[1]);
  if (!Number.isInteger(build)) {
    throw new Error('Invalid CardDefs.build attribute');
  }

  return build;
};

/** Runs one git command inside the configured repository and returns stdout as UTF-8 text. */
const runGit = (repoPath: string, args: string[], stdin?: string) => {
  const command = spawnSync('git', args, {
    cwd:    repoPath,
    input:  stdin,
    encoding: 'utf8',
  });

  if (command.status !== 0) {
    const stderr = command.stderr.trim();
    throw new Error(
      stderr.length > 0
        ? stderr
        : `git ${args.join(' ')} exited with status ${command.status}`,
    );
  }

  return command.stdout;
};

/** Resolves one saved hsdata repository path into a canonical git worktree root. */
export const resolveHsdataRepoRoot = (repoPath: string) => {
  const inputPath = trimToNull(repoPath);
  if (!inputPath) {
    throw new Error('Local hsdata repo is not configured');
  }

  const canonical = resolve(inputPath);
  const root = trimToNull(runGit(canonical, ['rev-parse', '--show-toplevel']));
  if (!root) {
    throw new Error('Failed to resolve hsdata repo root');
  }

  if (!existsSync(`${root}/CardDefs.xml`)) {
    throw new Error('CardDefs.xml was not found in the configured hsdata repo');
  }

  return root;
};

/** Resolves the active hsdata repository root from the runtime override. */
export const requireHsdataRepoRoot = () => {
  const repoPath = readHsdataRepoPath();

  if (!repoPath) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Local hsdata repo is not configured',
    });
  }

  try {
    return resolveHsdataRepoRoot(repoPath);
  } catch (error) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Resolves the current hsdata repository state without throwing when the repo is unset. */
export const getHsdataRepoState = () => {
  const repoPath = readHsdataRepoPath();
  if (!repoPath) {
    return {} satisfies HsdataRepoState;
  }

  try {
    return { repoPath: resolveHsdataRepoRoot(repoPath) } satisfies HsdataRepoState;
  } catch {
    return { repoPath } satisfies HsdataRepoState;
  }
};

/** Refreshes the current repository tags from the default remote. */
export const syncHsdataRemoteVersions = () => {
  const repoPath = requireHsdataRepoRoot();
  runGit(repoPath, ['fetch', '--prune', '--tags', hsdataRemoteName]);

  return {
    repoPath,
    remote: hsdataRemoteName,
  } satisfies HsdataSyncResult;
};

/** Reads CardDefs.xml from the current worktree. */
const readWorktreeXml = (repoPath: string) => {
  return readFileSync(`${repoPath}/CardDefs.xml`, 'utf8');
};

/** Reads the current worktree source metadata and XML content. */
const readWorktreeSource = (repoPath: string) => {
  const xml = readWorktreeXml(repoPath);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-parse', 'HEAD'])) ?? '';
  const time = trimToNull(runGit(repoPath, ['log', '-1', '--format=%cI', 'HEAD'])) ?? undefined;
  const size = statSync(`${repoPath}/CardDefs.xml`).size;

  return {
    id:           'worktree',
    name:         'worktree',
    kind:         'worktree' as const,
    size,
    time,
    xml,
    sourceTag,
    sourceCommit,
    shortCommit:  shortCommit(sourceCommit),
    sourceUri:    buildSourceUri('worktree'),
  } satisfies HsdataResolvedSource;
};

/** Reads CardDefs.xml from one git tag. */
const readTagSource = (repoPath: string, tag: string) => {
  const tagRef = `refs/tags/${tag}`;
  const object = `${tagRef}:CardDefs.xml`;
  const xml = runGit(repoPath, ['show', object]);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-list', '-n', '1', tagRef])) ?? '';
  const sizeText = trimToNull(runGit(repoPath, ['cat-file', '-s', object])) ?? '0';
  const size = Number(sizeText);
  const time = trimToNull(runGit(repoPath, ['log', '-1', '--format=%cI', tagRef])) ?? undefined;

  return {
    id:           `tag:${tag}`,
    name:         tag,
    kind:         'tag' as const,
    size,
    time,
    xml,
    sourceTag,
    sourceCommit,
    shortCommit:  shortCommit(sourceCommit),
    sourceUri:    buildSourceUri(`tag:${tag}`),
  } satisfies HsdataResolvedSource;
};

/** Resolves one supported hsdata source id into its XML payload. */
export const readHsdataSource = (id: string) => {
  const repoPath = requireHsdataRepoRoot();

  try {
    if (id === 'worktree') {
      return readWorktreeSource(repoPath);
    }

    const tag = id.startsWith('tag:') ? id.slice(4) : null;
    if (!tag) {
      throw new Error(`Unsupported hsdata source id: ${id}`);
    }

    return readTagSource(repoPath, tag);
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Parses one git tag line into source metadata when the output is structurally complete. */
const parseTagRefMeta = (line: string) => {
  const parts = line.split('\t');
  const [tagRef, tag, objectName, peeledObjectName, createdAt] = parts;

  if (!tagRef || !tag) {
    return null;
  }

  const sourceCommit = trimToNull(peeledObjectName) ?? trimToNull(objectName);
  if (!sourceCommit) {
    return null;
  }

  return {
    tagRef,
    tag,
    time:         trimToNull(createdAt) ?? undefined,
    sourceCommit,
  } satisfies HsdataTagRefMeta;
};

/** Parses one git cat-file batch output line into an optional blob size. */
const parseBlobCheckLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error('Missing git cat-file batch output');
  }

  if (trimmed.endsWith(' missing')) {
    return {} satisfies HsdataBlobCheck;
  }

  const parts = trimmed.split(/\s+/);
  const [, objectType, objectSize] = parts;

  if (objectType !== 'blob') {
    throw new Error(`Expected blob for hsdata source, got ${objectType}`);
  }

  const size = Number(objectSize);
  if (!Number.isInteger(size)) {
    throw new Error(`Failed to parse git object size from: ${trimmed}`);
  }

  return { size } satisfies HsdataBlobCheck;
};

/** Parses one numeric tag name into its sourceTag value when possible. */
const parseNumericTag = (tag: string) => {
  const value = Number(tag);
  return Number.isInteger(value) ? value : undefined;
};

/** Lists git tag based hsdata sources from the configured repository. */
export const listHsdataSources = () => {
  const repoPath = requireHsdataRepoRoot();

  const tagsOutput = runGit(repoPath, [
    'for-each-ref',
    '--format=%(refname)\t%(refname:short)\t%(objectname)\t%(*objectname)\t%(creatordate:iso-strict)',
    'refs/tags',
  ]);

  const tagRefs = tagsOutput
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseTagRefMeta)
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((left, right) => {
      const leftTag = parseNumericTag(left.tag);
      const rightTag = parseNumericTag(right.tag);

      if (leftTag != null && rightTag != null) {
        return rightTag - leftTag || left.tag.localeCompare(right.tag);
      }

      if (leftTag != null) {
        return -1;
      }

      if (rightTag != null) {
        return 1;
      }

      return left.tag.localeCompare(right.tag);
    });

  if (tagRefs.length === 0) {
    return [] satisfies HsdataFile[];
  }

  const batchInput = tagRefs.map(tagRef => `${tagRef.tagRef}:CardDefs.xml\n`).join('');
  const blobChecks = runGit(repoPath, ['cat-file', '--batch-check'], batchInput)
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(parseBlobCheckLine);

  return tagRefs.flatMap((tagRef, index) => {
    const blob = blobChecks[index];
    if (!blob?.size) {
      return [];
    }

    return [{
      id:           `tag:${tagRef.tag}`,
      name:         tagRef.tag,
      kind:         'tag' as const,
      size:         blob.size,
      time:         tagRef.time,
      sourceTag:    parseNumericTag(tagRef.tag),
      sourceCommit: tagRef.sourceCommit,
      shortCommit:  shortCommit(tagRef.sourceCommit),
      sourceUri:    buildSourceUri(`tag:${tagRef.tag}`),
    } satisfies HsdataFile];
  });
};
