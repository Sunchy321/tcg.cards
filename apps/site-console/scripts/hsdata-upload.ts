#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hsdataRepoConfigKey = 'hearthstone.hsdata-repo';
const defaultXmlPath = 'CardDefs.xml';

interface Options {
  repoPath:   string;
  xmlPath?:   string;
  gitRef?:    string;
  sourceTag?: number;
  bucket:     string;
  keyPrefix:  string;
  configPath: string;
  dryRun:     boolean;
  local:      boolean;
  listTags:   boolean;
}

interface ResolvedXml {
  path:        string;
  content:     string;
  commit:      string;
  shortCommit: string;
  sourceLabel: string;
}

interface CommandResult {
  exitCode: number;
  stdout:   string;
  stderr:   string;
}

interface HsdataStateHistory {
  tag:    string;
  commit: string;
  type:   string;
  date:   string;
  count?: number;
  size?:  number;
}

interface HsdataState {
  tag?:        string;
  commit?:     string;
  short?:      string;
  synced_at?:  string;
  type?:       string;
  file_count?: number;
  history:     HsdataStateHistory[];
}

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

function printUsage() {
  console.log(`
Upload CardDefs.xml from a local hsdata repo to Cloudflare R2.
Also refresh hearthstone/hsdata/state.json after a successful upload.

Usage:
  bun run hsdata:upload -- [--repo /path/to/hsdata]

Options:
  --repo <path>         Local hsdata repository path, overrides .git/config
  --xml <path>          XML file path, absolute or relative to repo root
  --tag <tag>           Read CardDefs.xml from a Git tag
  --ref <ref>           Read CardDefs.xml from any Git ref, commit, or branch
  --list-tags           List tags with CardDefs build information
  --source-tag <int>    Override sourceTag, defaults to CardDefs build
  --bucket <name>       R2 bucket name used by Wrangler (default: data)
  --key-prefix <path>   R2 key prefix (default: hearthstone/hsdata/data)
  --config <path>       Wrangler config path
  --dry-run             Print resolved upload info without writing to R2 or state.json
  --local               Upload to local R2 storage instead of remote
  --help                Show this message

Examples:
  git config --local ${hsdataRepoConfigKey} ~/dev/hsdata
  bun run hsdata:upload -- --list-tags
  bun run hsdata:upload -- --tag v31.0.0.3140 --dry-run
  bun run hsdata:upload -- --dry-run
  bun run hsdata:upload -- --repo ~/dev/hsdata
  bun run hsdata:upload -- --repo ~/dev/hsdata --source-tag 310295
`.trim());
}

function fail(message: string): never {
  throw new Error(message);
}

function parseInteger(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    fail(`${flag} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(`${flag} must be a safe non-negative integer`);
  }

  return parsed;
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

function normalizeKeyPrefix(value: string): string {
  const normalized = value.replace(/^\/+/, '').replace(/\/+$/, '');

  if (normalized.length === 0) {
    fail('--key-prefix must not be empty');
  }

  return normalized;
}

function parseArgs(argv: string[]): Options {
  const defaultConfigPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
  let repoPath = '';
  let xmlPath: string | undefined;
  let gitRef: string | undefined;
  let sourceTag: number | undefined;
  let bucket = 'data';
  let keyPrefix = 'hearthstone/hsdata/data';
  let configPath = defaultConfigPath;
  let dryRun = false;
  let local = false;
  let listTags = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith('--') && repoPath.length === 0) {
      repoPath = arg;
      continue;
    }

    switch (arg) {
    case '--repo':
      repoPath = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--xml':
      xmlPath = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--tag':
      if (gitRef) {
        fail('Use only one of --tag or --ref');
      }
      gitRef = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--ref':
      if (gitRef) {
        fail('Use only one of --tag or --ref');
      }
      gitRef = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--list-tags':
      listTags = true;
      break;
    case '--source-tag':
      sourceTag = parseInteger(takeValue(argv, index, arg), arg);
      index += 1;
      break;
    case '--bucket':
      bucket = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--key-prefix':
      keyPrefix = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--config':
      configPath = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--dry-run':
      dryRun = true;
      break;
    case '--local':
      local = true;
      break;
    default:
      fail(`Unknown argument: ${arg}`);
    }
  }

  return {
    repoPath,
    xmlPath,
    gitRef,
    sourceTag,
    bucket,
    keyPrefix: normalizeKeyPrefix(keyPrefix),
    configPath,
    dryRun,
    local,
    listTags,
  };
}

function normalizeXml(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd() + '\n';
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function extractBuild(content: string): number {
  const rootMatch = content.match(/<CardDefs\b[^>]*\bbuild="(\d+)"/);
  const fallbackMatch = content.match(/\bbuild="(\d+)"/);
  const rawValue = rootMatch?.[1] ?? fallbackMatch?.[1];

  if (!rawValue) {
    fail('Could not extract CardDefs build attribute from XML');
  }

  return parseInteger(rawValue, 'build');
}

function runCommandResult(cmd: string[], cwd?: string): CommandResult {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: result.exitCode,
    stdout:   decodeOutput(result.stdout),
    stderr:   decodeOutput(result.stderr),
  };
}

function getCommandDetail(result: CommandResult): string {
  return result.stderr.length > 0 ? result.stderr : result.stdout;
}

function runCommand(cmd: string[], cwd?: string): string {
  const result = runCommandResult(cmd, cwd);

  if (result.exitCode !== 0) {
    fail(`Command failed: ${cmd.join(' ')}\n${getCommandDetail(result)}`);
  }

  return result.stdout;
}

function tryRunCommand(cmd: string[], cwd?: string): string | null {
  const result = runCommandResult(cmd, cwd);

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout;
}

function resolvePath(basePath: string, targetPath: string): string {
  return isAbsolute(targetPath) ? resolve(targetPath) : resolve(basePath, targetPath);
}

function toGitPath(repoRoot: string, targetPath: string): string {
  const resolvedPath = resolvePath(repoRoot, targetPath);
  const gitPath = relative(repoRoot, resolvedPath).replaceAll('\\', '/');

  if (gitPath.length === 0 || gitPath.startsWith('../') || isAbsolute(gitPath)) {
    fail(`XML path must be inside hsdata repo when --tag or --ref is used: ${targetPath}`);
  }

  return gitPath;
}

function loadConfiguredRepoPath(workspaceRoot: string): string | null {
  const configuredPath = tryRunCommand([
    'git',
    '-C',
    workspaceRoot,
    'config',
    '--local',
    '--get',
    hsdataRepoConfigKey,
  ]);

  if (!configuredPath || configuredPath.length === 0) {
    return null;
  }

  return resolvePath(workspaceRoot, configuredPath);
}

function resolveGitCommit(repoRoot: string, gitRef: string): string {
  return runCommand(['git', '-C', repoRoot, 'rev-parse', `${gitRef}^{commit}`]);
}

function resolveShortCommit(repoRoot: string, commit: string): string {
  return runCommand(['git', '-C', repoRoot, 'rev-parse', '--short', commit]);
}

function gitFileExists(repoRoot: string, gitRef: string, gitPath: string): boolean {
  return tryRunCommand(['git', '-C', repoRoot, 'cat-file', '-e', `${gitRef}:${gitPath}`]) != null;
}

function readGitFile(repoRoot: string, gitRef: string, gitPath: string): string {
  return runCommand(['git', '-C', repoRoot, 'show', `${gitRef}:${gitPath}`]);
}

async function resolveXml(repoRoot: string, options: Options): Promise<ResolvedXml> {
  if (options.gitRef) {
    const commit = resolveGitCommit(repoRoot, options.gitRef);
    const shortCommit = resolveShortCommit(repoRoot, commit);
    const gitPath = options.xmlPath
      ? toGitPath(repoRoot, options.xmlPath)
      : defaultXmlPath;

    if (!gitFileExists(repoRoot, options.gitRef, gitPath)) {
      fail(`XML file does not exist at Git ref ${options.gitRef}: ${gitPath}`);
    }

    return {
      path:        gitPath,
      content:     readGitFile(repoRoot, options.gitRef, gitPath),
      commit,
      shortCommit,
      sourceLabel: options.gitRef,
    };
  }

  const commit = runCommand(['git', '-C', repoRoot, 'rev-parse', 'HEAD']);
  const shortCommit = resolveShortCommit(repoRoot, commit);
  const xmlPath = options.xmlPath
    ? resolvePath(repoRoot, options.xmlPath)
    : resolve(repoRoot, defaultXmlPath);

  if (!existsSync(xmlPath)) {
    fail(`XML file does not exist: ${xmlPath}`);
  }

  return {
    path:        relative(repoRoot, xmlPath),
    content:     await readFile(xmlPath, 'utf8'),
    commit,
    shortCommit,
    sourceLabel: 'worktree',
  };
}

function listTags(repoRoot: string) {
  const tagOutput = runCommand([
    'git',
    '-C',
    repoRoot,
    'tag',
    '--list',
    '--sort=-creatordate',
    '--format=%(refname:short)\t%(objectname:short)\t%(*objectname:short)',
  ]);

  const rows = tagOutput
    .split('\n')
    .filter(row => row.length > 0)
    .map(row => {
      const [tag = '', shortObject = '', shortPeeledObject = ''] = row.split('\t');
      const shortCommit = shortPeeledObject.length > 0 ? shortPeeledObject : shortObject;

      return {
        tag,
        build: tag,
        shortCommit,
      };
    });

  if (rows.length === 0) {
    console.log('No tags found.');
    return;
  }

  console.log(['tag', 'build', 'shortCommit', 'xml'].join('\t'));

  for (const row of rows) {
    console.log([row.tag, row.build, row.shortCommit, defaultXmlPath].join('\t'));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeHistoryEntry(value: unknown): HsdataStateHistory | null {
  if (!isRecord(value)) {
    return null;
  }

  const tag = optionalString(value.tag);
  const commit = optionalString(value.commit);
  const type = optionalString(value.type);
  const date = optionalString(value.date);

  if (!tag || !commit || !type || !date) {
    return null;
  }

  const count = normalizeCount(value.count);
  const size = normalizeCount(value.size);

  return {
    tag,
    commit,
    type,
    date,
    ...(count == null ? {} : { count }),
    ...(size == null ? {} : { size }),
  };
}

function normalizeState(value: unknown): HsdataState {
  if (!isRecord(value)) {
    return { history: [] };
  }

  const history = Array.isArray(value.history)
    ? value.history
      .map(item => normalizeHistoryEntry(item))
      .filter((item): item is HsdataStateHistory => item != null)
    : [];

  return {
    history,
    ...(optionalString(value.tag) == null ? {} : { tag: optionalString(value.tag) }),
    ...(optionalString(value.commit) == null ? {} : { commit: optionalString(value.commit) }),
    ...(optionalString(value.short) == null ? {} : { short: optionalString(value.short) }),
    ...(optionalString(value.synced_at) == null ? {} : { synced_at: optionalString(value.synced_at) }),
    ...(optionalString(value.type) == null ? {} : { type: optionalString(value.type) }),
    ...(normalizeCount(value.file_count) == null ? {} : { file_count: normalizeCount(value.file_count) }),
  };
}

function resolveStateKey(keyPrefix: string): string {
  const segments = keyPrefix.split('/');
  segments.pop();

  return segments.length > 0
    ? `${segments.join('/')}/state.json`
    : 'state.json';
}

function getWranglerModeFlag(local: boolean): '--local' | '--remote' {
  return local ? '--local' : '--remote';
}

async function readHsdataState(
  wranglerPath: string,
  configPath: string,
  bucket: string,
  stateKey: string,
  local: boolean,
  tempDir: string,
): Promise<HsdataState> {
  const statePath = `${bucket}/${stateKey}`;
  const tempStatePath = join(tempDir, 'state-current.json');
  const result = runCommandResult([
    wranglerPath,
    'r2',
    'object',
    'get',
    statePath,
    '--config',
    configPath,
    getWranglerModeFlag(local),
    '--file',
    tempStatePath,
  ]);

  if (result.exitCode !== 0) {
    if (getCommandDetail(result).includes('The specified key does not exist.')) {
      return { history: [] };
    }

    fail(`Command failed: ${result.stderr.length > 0 ? result.stderr : statePath}`);
  }

  try {
    const content = await readFile(tempStatePath, 'utf8');
    return normalizeState(JSON.parse(content) as unknown);
  } catch {
    return { history: [] };
  }
}

function buildNextState(
  previousState: HsdataState,
  sourceTag: number,
  commit: string,
  shortCommit: string,
  fileSize: number,
): HsdataState {
  const tag = String(sourceTag);
  const syncedAt = new Date().toISOString();
  const history = previousState.history ?? [];
  const knownArchive = (
    previousState.tag === tag
    && (
      previousState.commit === commit
      || previousState.commit === shortCommit
      || previousState.short === shortCommit
    )
  ) || history.some(item => (
    item.tag === tag
    && (item.commit === commit || item.commit === shortCommit)
  ));
  const previousCount = previousState.file_count ?? 0;
  const fileCount = knownArchive
    ? Math.max(previousCount, 1)
    : previousCount + 1;

  return {
    tag,
    commit,
    short:      shortCommit,
    synced_at:  syncedAt,
    type:       'single',
    file_count: fileCount,
    history: [
      {
        tag,
        commit,
        type:  'single',
        date:  syncedAt,
        count: 1,
        size:  fileSize,
      },
      ...history,
    ].slice(0, 50),
  };
}

async function writeHsdataState(
  wranglerPath: string,
  configPath: string,
  bucket: string,
  stateKey: string,
  local: boolean,
  tempDir: string,
  state: HsdataState,
) {
  const statePath = `${bucket}/${stateKey}`;
  const tempStatePath = join(tempDir, 'state-next.json');

  await Bun.write(tempStatePath, `${JSON.stringify(state, null, 2)}\n`);

  const output = runCommand([
    wranglerPath,
    'r2',
    'object',
    'put',
    statePath,
    '--config',
    configPath,
    getWranglerModeFlag(local),
    '--file',
    tempStatePath,
    '--content-type',
    'application/json',
  ]);

  if (output.length > 0) {
    console.log(output);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = resolve(options.configPath);
  const workspaceRoot = runCommand(['git', 'rev-parse', '--show-toplevel']);
  const repoPath = options.repoPath.length > 0
    ? resolve(options.repoPath)
    : loadConfiguredRepoPath(workspaceRoot);

  if (!repoPath) {
    fail(`Missing hsdata repo path. Pass --repo <path> or set git config --local ${hsdataRepoConfigKey} /path/to/hsdata`);
  }

  if (!existsSync(repoPath)) {
    fail(`Repo path does not exist: ${repoPath}`);
  }

  if (!existsSync(configPath)) {
    fail(`Wrangler config does not exist: ${configPath}`);
  }

  const repoRoot = runCommand(['git', '-C', repoPath, 'rev-parse', '--show-toplevel']);

  if (options.listTags) {
    listTags(repoRoot);
    return;
  }

  const wranglerPath = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
  if (!existsSync(wranglerPath)) {
    fail(`Wrangler binary not found: ${wranglerPath}`);
  }

  const resolvedXml = await resolveXml(repoRoot, options);
  const xmlContent = normalizeXml(resolvedXml.content);
  const build = extractBuild(xmlContent);
  const sourceTag = options.sourceTag ?? build;
  const sourceHash = sha256(xmlContent);
  const objectKey = `${options.keyPrefix}/${sourceTag}-${resolvedXml.shortCommit}.xml`;
  const objectPath = `${options.bucket}/${objectKey}`;
  const stateKey = resolveStateKey(options.keyPrefix);
  const statePath = `${options.bucket}/${stateKey}`;

  console.log(`Repo:        ${repoRoot}`);
  console.log(`Source:      ${resolvedXml.sourceLabel}`);
  console.log(`XML:         ${resolvedXml.path}`);
  console.log(`Build:       ${build}`);
  console.log(`sourceTag:   ${sourceTag}${options.sourceTag == null ? ' (derived from build)' : ''}`);
  console.log(`Commit:      ${resolvedXml.commit}`);
  console.log(`sourceHash:  ${sourceHash}`);
  console.log(`R2 object:   ${objectPath}`);
  console.log(`State:       ${statePath}`);
  console.log(`Target:      ${options.local ? 'local' : 'remote'}`);

  if (options.dryRun) {
    console.log('Dry run enabled, skipping upload and state update.');
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'hsdata-upload-'));
  const tempFilePath = join(tempDir, `${sourceTag}-${resolvedXml.shortCommit}.xml`);

  try {
    await Bun.write(tempFilePath, xmlContent);

    const uploadArgs = [
      wranglerPath,
      'r2',
      'object',
      'put',
      objectPath,
      '--config',
      configPath,
      options.local ? '--local' : '--remote',
      '--file',
      tempFilePath,
      '--content-type',
      'application/xml',
    ];

    const output = runCommand(uploadArgs);

    if (output.length > 0) {
      console.log(output);
    }

    console.log('Upload completed.');

    const previousState = await readHsdataState(
      wranglerPath,
      configPath,
      options.bucket,
      stateKey,
      options.local,
      tempDir,
    );
    const nextState = buildNextState(
      previousState,
      sourceTag,
      resolvedXml.commit,
      resolvedXml.shortCommit,
      Buffer.byteLength(xmlContent, 'utf8'),
    );

    await writeHsdataState(
      wranglerPath,
      configPath,
      options.bucket,
      stateKey,
      options.local,
      tempDir,
      nextState,
    );

    console.log('State updated.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
