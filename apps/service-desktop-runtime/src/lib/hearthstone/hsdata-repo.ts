import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { ORPCError } from '@orpc/server';

import { resolvePath } from '../game-paths';
import {
  mergeParsedHsdataParts,
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

/** CardDefs part files per ref. Since 2026-08-24 the upstream hsdata repo splits
 *  CardDefs by game mode: Bacon = Battlegrounds, Lettuce = Mercenaries. Older
 *  refs only carry the base file, so the extra parts stay optional everywhere. */
const cardDefsBasePath = 'CardDefs.xml';
const cardDefsPartPaths = [cardDefsBasePath, 'CardDefs.Bacon.xml', 'CardDefs.Lettuce.xml'];

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

/** Builds one stable local git URI for the CardDefs files at one repository ref. */
const buildSourceUri = (reference: string) => {
  return `git+local://hsdata?ref=${reference}&path=CardDefs*.xml`;
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

/** Parses the current worktree XML source for import without materializing duplicate buffers. */
const readWorktreeImportSource = async (repoPath: string) => {
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-parse', 'HEAD'])) ?? '';
  const commitMessage = getCommitMessage(repoPath, sourceCommit);
  const name = parsePatchName(commitMessage);
  const result = await parseWorktreeHsdataParts(repoPath);

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
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-list', '-n', '1', tagRef])) ?? '';
  const result = await parseRefHsdataParts(repoPath, `${tagRef}:`);
  // Derive the display name from the commit message (e.g. "Update to patch 30.0.0.198765"),
  // matching the other source readers; the raw tag is only a fallback.
  const name = sourceCommit ? parsePatchName(getCommitMessage(repoPath, sourceCommit)) : tag;

  return {
    sourceTag:  result.parsed.build,
    sourceCommit,
    sourceUri:  buildSourceUri(`tag:${tag}`),
    sourceHash: result.sourceHash,
    name,
    parsed:     result.parsed,
  } satisfies HsdataImportSource;
};

/** Parses CardDefs from a bare commit (no tag) for import. */
const readCommitImportSource = async (repoPath: string, commit: string, buildNumber: number) => {
  const result = await parseRefHsdataParts(repoPath, `${commit}:`);
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

/** Resolves the active hsdata repository root from the effective `hearthstone.data.hsdata` path. */
export const requireHsdataRepoRoot = () => {
  const repoPath = resolvePath('hearthstone.data.hsdata');

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
  const repoPath = resolvePath('hearthstone.data.hsdata');
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

/** Reads the merged CardDefs preview document from the current worktree. */
const readWorktreeXml = async (repoPath: string) => {
  const parts: string[] = [];
  for (const path of cardDefsPartPaths) {
    const file = Bun.file(`${repoPath}/${path}`);
    if (!await file.exists()) continue;
    parts.push(await readNormalizedHsdataXmlStream(file.stream()));
  }

  return mergeCardDefsXmlText(parts[0]!, parts.slice(1));
};

/** Reads the current worktree source metadata and XML content. */
const readWorktreeSource = async (repoPath: string) => {
  const xml = await readWorktreeXml(repoPath);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-parse', 'HEAD'])) ?? '';
  const time = trimToNull(runGit(repoPath, ['log', '-1', '--format=%cI', 'HEAD'])) ?? undefined;

  let size = 0;
  for (const path of cardDefsPartPaths) {
    const full = `${repoPath}/${path}`;
    if (path !== cardDefsBasePath && !existsSync(full)) continue;
    size += statSync(full).size;
  }

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

/** Reads the merged CardDefs preview document from one git tag. */
const readTagSource = async (repoPath: string, tag: string) => {
  const tagRef = `refs/tags/${tag}`;
  const objects = listRefCardDefsParts(repoPath, `${tagRef}:`);

  const extras: string[] = [];
  let baseXml: string | null = null;
  let size = 0;
  for (const object of objects) {
    const text = await runGitText(repoPath, ['cat-file', 'blob', object]);
    if (baseXml == null) {
      baseXml = text;
    } else {
      extras.push(text);
    }
    const sizeText = trimToNull(runGit(repoPath, ['cat-file', '-s', object])) ?? '0';
    size += Number(sizeText);
  }

  const xml = mergeCardDefsXmlText(baseXml!, extras);
  const sourceTag = parseCardDefsBuild(xml);
  const sourceCommit = trimToNull(runGit(repoPath, ['rev-list', '-n', '1', tagRef])) ?? '';
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

/** Lists the CardDefs part blobs that exist at one `<ref>:` object prefix, in
 *  stable part order. The base file is required; the extra parts are optional. */
const listRefCardDefsParts = (repoPath: string, objectPrefix: string) => {
  const requested = cardDefsPartPaths.map(path => `${objectPrefix}${path}`);
  const lines = runGit(repoPath, ['cat-file', '--batch-check'], requested.map(object => `${object}\n`).join(''))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length !== requested.length) {
    throw new Error('Unexpected git cat-file batch-check output');
  }

  const objects: string[] = [];
  for (let index = 0; index < requested.length; index++) {
    if (lines[index]!.endsWith(' missing')) continue;
    parseBlobCheckLine(lines[index]!);
    objects.push(requested[index]!);
  }

  if (!objects.includes(`${objectPrefix}${cardDefsBasePath}`)) {
    throw new Error(`${cardDefsBasePath} was not found at ${objectPrefix}`);
  }

  return objects;
};

/** Drains one stream into one running hasher without buffering the whole payload. */
const hashStreamInto = async (stream: ReadableStream<Uint8Array>, hasher: Bun.CryptoHasher) => {
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
  }
};

/** Parses every existing CardDefs part blob at one `<ref>:` prefix into one merged
 *  payload. Raw part bytes are hashed in stable part order, so the source hash
 *  matches the patch metadata sync and stays identical for single-part refs. */
const parseRefHsdataParts = async (repoPath: string, objectPrefix: string): Promise<ParsedHsdataStreamResult> => {
  const objects = listRefCardDefsParts(repoPath, objectPrefix);
  const rawHasher = new Bun.CryptoHasher('sha256');
  const parts: ParsedHsdataStreamResult[] = [];

  for (const object of objects) {
    const args = ['cat-file', 'blob', object];
    const proc = spawnGit(repoPath, args);
    const [hashStream, parseStream] = proc.stdout.tee();
    const hashDone = hashStreamInto(hashStream, rawHasher);

    let parseError: unknown = null;
    let parsed: ParsedHsdataStreamResult | null = null;
    try {
      parsed = await parseHsdataXmlStream(parseStream);
    } catch (error) {
      parseError = error;
    }

    await hashDone;
    const status = await proc.exited;
    if (status !== 0) {
      throw new Error(formatGitCommandFailure(args, {
        status,
        signal: proc.signalCode,
        error:  null,
        stderr: await new Response(proc.stderr).text(),
      }));
    }
    if (parseError != null) {
      throw parseError;
    }

    parts.push(parsed!);
  }

  return { parsed: mergeParsedHsdataParts(parts), sourceHash: rawHasher.digest('hex') };
};

/** Parses every existing CardDefs part file in the worktree into one merged payload. */
const parseWorktreeHsdataParts = async (repoPath: string): Promise<ParsedHsdataStreamResult> => {
  const rawHasher = new Bun.CryptoHasher('sha256');
  const parts: ParsedHsdataStreamResult[] = [];

  for (const path of cardDefsPartPaths) {
    const file = Bun.file(`${repoPath}/${path}`);
    if (!await file.exists()) {
      if (path === cardDefsBasePath) {
        throw new Error(`${cardDefsBasePath} was not found in the hsdata repo worktree`);
      }
      continue;
    }

    const [hashStream, parseStream] = file.stream().tee();
    const hashDone = hashStreamInto(hashStream, rawHasher);
    parts.push(await parseHsdataXmlStream(parseStream));
    await hashDone;
  }

  return { parsed: mergeParsedHsdataParts(parts), sourceHash: rawHasher.digest('hex') };
};

/** Splices extra CardDefs part documents' entity blocks into the base document,
 *  so one preview payload can show every entity of the ref. */
const mergeCardDefsXmlText = (base: string, extras: string[]) => {
  let merged = base;
  for (const extra of extras) {
    const openEnd = extra.indexOf('>', Math.max(0, extra.indexOf('<CardDefs')));
    const closeStart = extra.lastIndexOf('</CardDefs>');
    const mergedClose = merged.lastIndexOf('</CardDefs>');
    if (openEnd < 0 || closeStart < 0 || mergedClose < 0) {
      throw new Error('Failed to locate CardDefs document boundaries');
    }
    merged = `${merged.slice(0, mergedClose)}${extra.slice(openEnd + 1, closeStart)}${merged.slice(mergedClose)}`;
  }
  return merged;
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

    // Hash the raw bytes of every existing part file in stable part order, matching
    // the multi-part import source hash (identical for pre-split single-file refs).
    const objects = listRefCardDefsParts(repoPath, `${tagRef}:`);
    const hasher = new Bun.CryptoHasher('sha256');
    for (const object of objects) {
      const proc = spawnGit(repoPath, ['cat-file', 'blob', object]);
      const reader = proc.stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        hasher.update(value);
      }
      const exitStatus = await proc.exited;
      if (exitStatus !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(formatGitCommandFailure(
          ['cat-file', 'blob', object],
          { status: exitStatus, signal: proc.signalCode, error: null, stderr },
        ));
      }
    }
    const hash = hasher.digest('hex');

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

    try {
      const objects = listRefCardDefsParts(repoPath, `${extraCommit}:`);
      const hasher = new Bun.CryptoHasher('sha256');
      for (const object of objects) {
        const proc = spawnGit(repoPath, ['cat-file', 'blob', object]);
        const reader = proc.stdout.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          hasher.update(value);
        }
        const exitStatus = await proc.exited;
        if (exitStatus !== 0) throw new Error(`git cat-file blob ${object} exited with status ${exitStatus}`);
      }

      result.push({ buildNumber, name, commit: extraCommit, hash: hasher.digest('hex'), releaseDate });
    } catch {
      // Untagged commits may predate the repository's available history; skip them.
      continue;
    }
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

  const batchInput = tagRefs
    .flatMap(tagRef => cardDefsPartPaths.map(path => `${tagRef.tagRef}:${path}\n`))
    .join('');
  const blobChecks = runGit(repoPath, ['cat-file', '--batch-check'], batchInput)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseBlobCheckLine);

  if (blobChecks.length !== tagRefs.length * cardDefsPartPaths.length) {
    throw new Error('Unexpected git cat-file batch-check output');
  }

  return tagRefs.flatMap((tagRef, tagIndex) => {
    // One ref spans several part files since the upstream CardDefs split; the
    // shown size covers every part, and refs without the base file are skipped.
    let size = 0;
    let hasBase = false;
    for (let partIndex = 0; partIndex < cardDefsPartPaths.length; partIndex++) {
      const blob = blobChecks[tagIndex * cardDefsPartPaths.length + partIndex];
      if (!blob?.size) continue;
      size += blob.size;
      if (partIndex === 0) hasBase = true;
    }

    if (!hasBase) {
      return [];
    }

    return [{
      id:           `tag:${tagRef.tag}`,
      name:         tagRef.tag,
      kind:         'tag' as const,
      size,
      time:         tagRef.time,
      sourceTag:    parseNumericTag(tagRef.tag),
      sourceCommit: tagRef.sourceCommit,
      shortCommit:  shortCommit(tagRef.sourceCommit),
      sourceUri:    buildSourceUri(`tag:${tagRef.tag}`),
    } satisfies HsdataFile];
  });
};
