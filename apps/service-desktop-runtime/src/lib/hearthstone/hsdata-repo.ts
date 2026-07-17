import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { ORPCError } from '@orpc/server';

import { readHsdataRepoPath } from '../../runtime-config';
import {
  parseHsdataXmlStream,
  readNormalizedHsdataXmlStream,
  type ParsedHsdataStreamResult,
} from './hsdata-xml';

/** Supported hsdata source kinds returned by the desktop runtime repository scan. */
export type HsdataSourceKind = 'tag' | 'worktree';

/** One hsdata source entry listed from the configured local repository. */
export interface HsdataFile {
  id:           string;
  name:         string;
  kind:         HsdataSourceKind;
  size:         number;
  time?:        string;
  sourceTag?:   number;
  sourceCommit: string;
  shortCommit:  string;
  sourceUri:    string;
}

/** One hsdata source resolved into XML content from the configured local repository. */
export interface HsdataResolvedSource extends HsdataFile {
  xml:       string;
  sourceTag: number;
}

/** One hsdata source resolved into parsed import data without materializing the full XML string. */
export interface HsdataImportSource {
  sourceTag:    number;
  sourceCommit: string;
  sourceUri:    string;
  sourceHash:   string;
  /** Patch name extracted from the tag name or commit message (e.g. "30.0.0.198765"). */
  name:         string;
  parsed:       ParsedHsdataStreamResult['parsed'];
}

/** Patch metadata for one tag, computed without parsing the full XML. */
export interface HsdataPatchMeta {
  buildNumber: number;
  name:        string;
  commit:      string;
  hash:        string;
  /** ISO date string from the tag's creator date (e.g. "2026-07-15"). */
  releaseDate: string;
}

/** Repo state returned to the desktop frontend. */
export interface HsdataRepoState {
  repoPath?: string;
}

/** Git fetch summary returned after refreshing remote tags. */
export interface HsdataSyncResult {
  repoPath: string;
  remote:   string;
}

/** Parsed metadata from one git tag reference line. */
interface HsdataTagRefMeta {
  tagRef:       string;
  tag:          string;
  time?:        string;
  sourceCommit: string;
}

/** Git blob existence and size resolved through batch cat-file output. */
interface HsdataBlobCheck {
  size?: number;
}

const hsdataRemoteName = 'origin';
const gitOutputMaxBufferBytes = 64 * 1024 * 1024;

/** One minimal git subprocess result shape used for readable runtime errors. */
interface GitCommandResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error | null;
  stderr: string;
}

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

/** Formats one git subprocess failure into a readable runtime error message. */
const formatGitCommandFailure = (args: string[], command: GitCommandResult) => {
  const stderr = trimToNull(command.stderr);
  if (stderr) {
    return stderr;
  }

  const commandText = `git ${args.join(' ')}`;
  if (command.error) {
    return `${commandText} failed: ${command.error.message}`;
  }

  if (command.signal) {
    return `${commandText} was terminated by signal ${command.signal}`;
  }

  if (command.status == null) {
    return `${commandText} failed without an exit status`;
  }

  return `${commandText} exited with status ${command.status}`;
};

/** Runs one git command inside the configured repository and returns stdout as UTF-8 text. */
const runGit = (repoPath: string, args: string[], stdin?: string) => {
  const command = spawnSync('git', args, {
    cwd:       repoPath,
    input:     stdin,
    encoding:  'utf8',
    maxBuffer: gitOutputMaxBufferBytes,
  });

  if (command.status !== 0) {
    throw new Error(formatGitCommandFailure(args, command));
  }

  return command.stdout;
};

/** Starts one Bun-managed git subprocess with piped stdout and stderr. */
const spawnGit = (repoPath: string, args: string[], stdin?: string) => {
  try {
    return Bun.spawn({
      cmd:    ['git', ...args],
      cwd:    repoPath,
      stdin:  stdin == null ? 'ignore' : Buffer.from(stdin, 'utf8'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (error) {
    const err = new Error(formatGitCommandFailure(args, {
      status: null,
      signal: null,
      error:  error instanceof Error ? error : new Error(String(error)),
      stderr: '',
    }));

    err.cause = error instanceof Error ? error : undefined;
    throw err;
  }
};

/** Reads one git command stdout fully through Bun.spawn for payload-sized outputs. */
const runGitText = async (repoPath: string, args: string[], stdin?: string) => {
  const command = spawnGit(repoPath, args, stdin);
  const [status, stdout, stderr] = await Promise.all([
    command.exited,
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
  ]);

  if (status !== 0) {
    throw new Error(formatGitCommandFailure(args, {
      status,
      signal: command.signalCode,
      error:  null,
      stderr,
    }));
  }

  return stdout;
};

/** Parses one large git XML payload through Bun.spawn without first buffering the full document. */
const parseGitHsdataXml = async (repoPath: string, args: string[]) => {
  const command = spawnGit(repoPath, args);
  const [parsedResult, statusResult, stderrResult] = await Promise.allSettled([
    parseHsdataXmlStream(command.stdout),
    command.exited,
    new Response(command.stderr).text(),
  ]);

  const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
  const stderr = stderrResult.status === 'fulfilled' ? stderrResult.value : '';

  if (status !== 0) {
    throw new Error(formatGitCommandFailure(args, {
      status,
      signal: command.signalCode,
      error:  null,
      stderr,
    }));
  }

  if (parsedResult.status === 'rejected') {
    throw parsedResult.reason;
  }

  return parsedResult.value;
};

/** Test-only helpers exposed for focused hsdata repository unit tests. */
export const hsdataRepoTestUtils = {
  formatGitCommandFailure,
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
const readWorktreeXml = async (repoPath: string) => {
  return await readNormalizedHsdataXmlStream(Bun.file(`${repoPath}/CardDefs.xml`).stream());
};

/** Reads the current worktree source metadata and XML content. */
const readWorktreeSource = async (repoPath: string) => {
  const xml = await readWorktreeXml(repoPath);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-parse', 'HEAD'])) ?? '';
  const time = trimToNull(runGit(repoPath, ['log', '-1', '--format=%cI', 'HEAD'])) ?? undefined;
  const size = statSync(`${repoPath}/CardDefs.xml`).size;

  return {
    id:          'worktree',
    name:        'worktree',
    kind:        'worktree' as const,
    size,
    time,
    xml,
    sourceTag,
    sourceCommit,
    shortCommit: shortCommit(sourceCommit),
    sourceUri:   buildSourceUri('worktree'),
  } satisfies HsdataResolvedSource;
};

/** Reads CardDefs.xml from one git tag. */
const readTagSource = async (repoPath: string, tag: string) => {
  const tagRef = `refs/tags/${tag}`;
  const object = `${tagRef}:CardDefs.xml`;
  const xml = await runGitText(repoPath, ['cat-file', 'blob', object]);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-list', '-n', '1', tagRef])) ?? '';
  const sizeText = trimToNull(runGit(repoPath, ['cat-file', '-s', object])) ?? '0';
  const size = Number(sizeText);
  const time = trimToNull(runGit(repoPath, ['log', '-1', '--format=%cI', tagRef])) ?? undefined;

  return {
    id:          `tag:${tag}`,
    name:        tag,
    kind:        'tag' as const,
    size,
    time,
    xml,
    sourceTag,
    sourceCommit,
    shortCommit: shortCommit(sourceCommit),
    sourceUri:   buildSourceUri(`tag:${tag}`),
  } satisfies HsdataResolvedSource;
};

/** Resolves one supported hsdata source id into its XML payload. */
export const readHsdataSource = async (id: string) => {
  const repoPath = requireHsdataRepoRoot();

  try {
    if (id === 'worktree') {
      return await readWorktreeSource(repoPath);
    }

    const tag = id.startsWith('tag:') ? id.slice(4) : null;
    if (!tag) {
      throw new Error(`Unsupported hsdata source id: ${id}`);
    }

    return await readTagSource(repoPath, tag);
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Extracts the patch name from a commit message matching "Update to patch xxx". */
const parsePatchName = (commitMessage: string) => {
  const match = commitMessage.match(/\d+\.\d+\.\d+\.\d+/);
  if (!match) {
    throw new Error(`Failed to parse patch name from commit message: ${commitMessage}`);
  }
  return match[0]!;
};

/** Gets the commit message for one commit hash inside the configured repository. */
const getCommitMessage = (repoPath: string, commitHash: string) => {
  return trimToNull(runGit(repoPath, ['log', '--format=%s', '-n', '1', commitHash])) ?? '';
};

/** Parses the current worktree XML source for import without materializing duplicate buffers. */
const readWorktreeImportSource = async (repoPath: string) => {
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-parse', 'HEAD'])) ?? '';
  const commitMessage = getCommitMessage(repoPath, sourceCommit);
  const name = parsePatchName(commitMessage);
  const result = await parseHsdataXmlStream(Bun.file(`${repoPath}/CardDefs.xml`).stream());

  return {
    sourceTag:  result.parsed.build,
    sourceCommit,
    sourceUri:  buildSourceUri('worktree'),
    sourceHash: result.sourceHash,
    name,
    parsed:     result.parsed,
  } satisfies HsdataImportSource;
};

/** Parses one tagged XML source for import directly from git stdout. */
const readTagImportSource = async (repoPath: string, tag: string) => {
  const tagRef = `refs/tags/${tag}`;
  const object = `${tagRef}:CardDefs.xml`;
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-list', '-n', '1', tagRef])) ?? '';
  const result = await parseGitHsdataXml(repoPath, ['cat-file', 'blob', object]);

  return {
    sourceTag:  result.parsed.build,
    sourceCommit,
    sourceUri:  buildSourceUri(`tag:${tag}`),
    sourceHash: result.sourceHash,
    name:       tag,
    parsed:     result.parsed,
  } satisfies HsdataImportSource;
};

/** Parses CardDefs.xml from a bare commit (no tag) for import. */
const readCommitImportSource = async (repoPath: string, commit: string, buildNumber: number) => {
  const result = await parseGitHsdataXml(repoPath, ['cat-file', 'blob', `${commit}:CardDefs.xml`]);
  const commitMessage = runGit(repoPath, ['log', '--format=%s', '-n', '1', commit]);
  const name = parsePatchName(commitMessage);

  return {
    sourceTag:    result.parsed.build,
    sourceCommit: commit,
    sourceUri:    buildSourceUri(`tag:${buildNumber}`),
    sourceHash:   result.sourceHash,
    name,
    parsed:       result.parsed,
  } satisfies HsdataImportSource;
};

/** Resolves one supported hsdata source id into parsed import data. */
export const readHsdataImportSource = async (id: string) => {
  const repoPath = requireHsdataRepoRoot();

  try {
    if (id === 'worktree') {
      return await readWorktreeImportSource(repoPath);
    }

    const tag = id.startsWith('tag:') ? id.slice(4) : null;
    if (!tag) {
      throw new Error(`Unsupported hsdata source id: ${id}`);
    }

    const buildNumber = parseInt(tag, 10);
    const extra = EXTRA_PATCH_COMMITS.find(e => e.buildNumber === buildNumber);
    if (extra) {
      return await readCommitImportSource(repoPath, extra.commit, buildNumber);
    }

    return await readTagImportSource(repoPath, tag);
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
    time: trimToNull(createdAt) ?? undefined,
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

/** Collects patch metadata (name, commit, CardDefs.xml SHA256) for all git tags
 *  without parsing the XML entities. Uses streaming to avoid buffer limits. */
export const collectAllPatchMeta = async (): Promise<HsdataPatchMeta[]> => {
  const repoPath = requireHsdataRepoRoot();

  const tagsOutput = runGit(repoPath, [
    'for-each-ref',
    '--format=%(refname:short)\t%(*objectname)\t%(objectname)\t%(creatordate:iso-strict)',
    'refs/tags',
  ]);

  const result: HsdataPatchMeta[] = [];

  for (const line of tagsOutput.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const [tag, peeledObject, objectName, date] = trimmed.split('\t');
    if (!tag) continue;

    const commit = trimToNull(peeledObject) ?? trimToNull(objectName) ?? '';
    const buildNumber = parseNumericTag(tag);
    if (buildNumber == null) continue;

    // Extract date-only part (YYYY-MM-DD) from ISO timestamp.
    const releaseDate = (date ?? '').slice(0, 10) || '';

    // Read commit message to get patch name (e.g. "Update to patch 30.0.0.198765").
    const tagRef = `refs/tags/${tag}`;
    const commitMessage = runGit(repoPath, ['log', '--format=%s', '-n', '1', commit || tagRef]);
    const name = parsePatchName(commitMessage);

    // Stream CardDefs.xml through SHA256 to avoid buffer limits.
    const proc = spawnGit(repoPath, ['cat-file', 'blob', `${tagRef}:CardDefs.xml`]);
    const buffer = await new Response(proc.stdout).arrayBuffer();
    const hash = Bun.SHA256.hash(buffer, 'hex') as string;
    const exitStatus = await proc.exited;
    if (exitStatus !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(formatGitCommandFailure(
        ['cat-file', 'blob', `${tagRef}:CardDefs.xml`],
        { status: exitStatus, signal: proc.signalCode, error: null, stderr },
      ));
    }

    result.push({ buildNumber, name, commit, hash, releaseDate });
  }

  // Manually backfill commits that were never tagged.
  for (const { commit: extraCommit, buildNumber } of EXTRA_PATCH_COMMITS) {
    const existing = result.find(m => m.commit === extraCommit);
    if (existing) continue;

    const commitMessage = runGit(repoPath, ['log', '--format=%s', '-n', '1', extraCommit]);
    const name = parsePatchName(commitMessage);

    const dateOutput = runGit(repoPath, ['log', '--format=%cI', '-n', '1', extraCommit]);
    const releaseDate = (dateOutput.trim()).slice(0, 10);

    const proc = spawnGit(repoPath, ['cat-file', 'blob', `${extraCommit}:CardDefs.xml`]);
    const buffer = await new Response(proc.stdout).arrayBuffer();
    const hash = Bun.SHA256.hash(buffer, 'hex') as string;
    const exitStatus = await proc.exited;
    if (exitStatus !== 0) continue;

    result.push({ buildNumber, name, commit: extraCommit, hash, releaseDate });
  }

  result.sort((a, b) => a.buildNumber - b.buildNumber);
  return result;
};

/** Commits that should be treated as patch versions even though they lack a tag.
 *  Each entry maps a commit hash to its buildNumber, which must match the
 *  last dotted segment of the commit's patch version name. */
const EXTRA_PATCH_COMMITS: Array<{ commit: string, buildNumber: number }> = [
  { commit: '9016168146cc3ce0369e8cbc54eb8395afba75a0', buildNumber: 135540 },
];

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

  // Append extra commits that lack a tag, pretending they have one.
  for (const { commit, buildNumber } of EXTRA_PATCH_COMMITS) {
    if (tagRefs.some(tr => tr.sourceCommit === commit)) continue;

    const sizeLine = runGit(repoPath, ['cat-file', '--batch-check'], `${commit}:CardDefs.xml\n`);
    const blob = parseBlobCheckLine(sizeLine);
    if (!blob?.size) continue;

    tagRefs.push({
      tagRef:       commit,
      tag:          String(buildNumber),
      time:         undefined,
      sourceCommit: commit,
    });
  }

  tagRefs.sort((a, b) => {
    const na = parseNumericTag(a.tag);
    const nb = parseNumericTag(b.tag);
    return (na ?? 0) - (nb ?? 0);
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
