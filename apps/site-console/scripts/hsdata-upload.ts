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

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

function printUsage() {
  console.log(`
Upload CardDefs.xml from a local hsdata repo to Cloudflare R2.

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
  --dry-run             Print resolved upload info without writing to R2
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

function runCommand(cmd: string[], cwd?: string): string {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    const stderr = decodeOutput(result.stderr);
    const stdout = decodeOutput(result.stdout);
    const detail = stderr.length > 0 ? stderr : stdout;
    fail(`Command failed: ${cmd.join(' ')}\n${detail}`);
  }

  return decodeOutput(result.stdout);
}

function tryRunCommand(cmd: string[], cwd?: string): string | null {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    return null;
  }

  return decodeOutput(result.stdout);
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

  console.log(`Repo:        ${repoRoot}`);
  console.log(`Source:      ${resolvedXml.sourceLabel}`);
  console.log(`XML:         ${resolvedXml.path}`);
  console.log(`Build:       ${build}`);
  console.log(`sourceTag:   ${sourceTag}${options.sourceTag == null ? ' (derived from build)' : ''}`);
  console.log(`Commit:      ${resolvedXml.commit}`);
  console.log(`sourceHash:  ${sourceHash}`);
  console.log(`R2 object:   ${objectPath}`);
  console.log(`Target:      ${options.local ? 'local' : 'remote'}`);

  if (options.dryRun) {
    console.log('Dry run enabled, skipping upload.');
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
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
