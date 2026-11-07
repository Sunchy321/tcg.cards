import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

/** One named integer member in the decompiled GAME_TAG declaration. */
export interface GameTagMember {
  enumId:           number;
  rawName:          string;
  declarationIndex: number;
}

const execFileAsync = promisify(execFile);
const defaultAssemblyPath = '/Applications/Hearthstone/Hearthstone.app/Contents/Resources/Data/Managed/Assembly-CSharp.dll';
const userErrorMessage = '无法读取游戏标签，请确认游戏文件和反编译工具可用后重试。';

/** Removes C# comments before declaration parsing. */
function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
}

/** Finds the closing brace for one C# enum body. */
function findClosingBrace(source: string, openingIndex: number) {
  let depth = 0;

  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error('GAME_TAG declaration has no closing brace');
}

/** Parses every explicit decimal member from one ILSpy enum declaration. */
export function parseGameTagSource(source: string): GameTagMember[] {
  const cleanSource = stripComments(source);
  const declarationMatches = [...cleanSource.matchAll(/\benum\s+GAME_TAG\b/g)];
  const onlyDeclaration = declarationMatches[0];

  if (declarationMatches.length !== 1 || !onlyDeclaration) {
    throw new Error('Expected exactly one GAME_TAG declaration');
  }

  const declarationIndex = onlyDeclaration.index ?? -1;
  const declaration = /\benum\s+GAME_TAG\s*(?::\s*[A-Za-z_][A-Za-z0-9_.]*)?\s*\{/g;
  declaration.lastIndex = declarationIndex;
  const header = declaration.exec(cleanSource);

  if (!header) {
    throw new Error('GAME_TAG declaration has an unsupported header');
  }

  const openingIndex = cleanSource.indexOf('{', header.index);
  const closingIndex = findClosingBrace(cleanSource, openingIndex);
  const body = cleanSource.slice(openingIndex + 1, closingIndex);
  const members: GameTagMember[] = [];
  const names = new Set<string>();

  for (const [lineIndex, rawLine] of body.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const member = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+)\s*,?$/.exec(line);
    if (!member) {
      throw new Error(`Unrecognized GAME_TAG member at line ${lineIndex + 1}`);
    }

    const rawName = member[1];
    const rawValue = member[2];
    if (!rawName || !rawValue) {
      throw new Error(`Incomplete GAME_TAG member at line ${lineIndex + 1}`);
    }

    const enumId = Number(rawValue);
    if (!Number.isSafeInteger(enumId) || enumId < -2147483648 || enumId > 2147483647) {
      throw new Error(`GAME_TAG member ${rawName} has an invalid integer value`);
    }
    if (names.has(rawName)) {
      throw new Error(`GAME_TAG member name ${rawName} is declared more than once`);
    }

    names.add(rawName);
    members.push({ enumId, rawName, declarationIndex: members.length });
  }

  if (members.length === 0) {
    throw new Error('GAME_TAG declaration contains no members');
  }

  return members;
}

/** Expands a home-directory prefix in a user-configured executable path. */
function expandHomePath(value: string) {
  if (value === '~') {
    return homedir();
  }
  if (value.startsWith(`~${sep}`)) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

/** Checks whether a candidate can be executed by the current process. */
async function isExecutable(candidate: string) {
  try {
    await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolves the configured CLI, PATH entries, or the standard .NET tool location. */
async function findIlspyCommand() {
  const configured = process.env.ILSPYCMD?.trim();
  const command = expandHomePath(configured || 'ilspycmd');
  const hasPath = isAbsolute(command) || command.includes(sep);
  const candidates = hasPath
    ? [resolve(command)]
    : [
      ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command)),
      ...(!configured ? [join(homedir(), '.dotnet', 'tools', command)] : []),
    ];

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate executable ${command}`);
}

/** Reads and parses GAME_TAG on demand without requiring the CLI during app startup. */
export async function readGameTagSource(): Promise<GameTagMember[]> {
  const assemblyPath = resolve(process.env.HEARTHSTONE_ASSEMBLY ?? defaultAssemblyPath);

  try {
    await access(assemblyPath, constants.R_OK);
    const command = await findIlspyCommand();
    const result = await execFileAsync(command, ['-t', 'GAME_TAG', assemblyPath], {
      encoding:    'utf8',
      maxBuffer:   32 * 1024 * 1024,
      windowsHide: true,
    });

    return parseGameTagSource(result.stdout);
  } catch (error) {
    console.error('[hearthstone-game-tag] Failed to read GAME_TAG', {
      assemblyPath,
      command: process.env.ILSPYCMD ?? 'ilspycmd',
      error,
    });
    throw new Error(userErrorMessage, { cause: error });
  }
}
