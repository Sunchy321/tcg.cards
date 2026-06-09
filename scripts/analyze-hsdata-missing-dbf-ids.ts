#!/usr/bin/env bun
/// <reference types="bun" />

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Command line options for the hsdata missing dbfId analyzer. */
interface Options {
  repoPath:   string
  outputDir:  string
  fromTag:    number | null
  toTag:      number | null
  limit:      number | null
}

/** One git tag that can be scanned for CardDefs.xml content. */
interface TagRef {
  name:      string
  sourceTag: number
}

/** Missing dbfId reason groups used by the report. */
type MissingKind = 'missing' | 'zero' | 'invalid'

/** Aggregated missing dbfId data for one cardId. */
interface MissingCardSummary {
  cardId:                  string
  firstMissingSourceTag:   number
  missingOccurrenceCount:  number
  missingSourceTagCount:   number
  missingKinds:            MissingKind[]
}

/** Aggregated positive dbfId data for one cardId. */
interface PositiveCardSummary {
  cardId:                 string
  candidateDbfIds:        number[]
  firstResolvedSourceTag: number
  lastResolvedSourceTag:  number
  resolvedSourceTagCount: number
}

/** One statically resolvable cardId mapping. */
interface ResolvableCardSummary {
  cardId:                 string
  dbfId:                  number
  firstMissingSourceTag:  number
  missingOccurrenceCount: number
  missingSourceTagCount:  number
  firstResolvedSourceTag: number
  lastResolvedSourceTag:  number
  resolvedSourceTagCount: number
  missingKinds:           MissingKind[]
}

/** One cardId whose later tags disagree on the dbfId value. */
interface ConflictingCardSummary {
  cardId:                 string
  firstMissingSourceTag:  number
  missingOccurrenceCount: number
  missingSourceTagCount:  number
  candidateDbfIds:        number[]
  firstResolvedSourceTag: number
  lastResolvedSourceTag:  number
  resolvedSourceTagCount: number
  missingKinds:           MissingKind[]
}

/** One cardId that never finds a positive dbfId in scanned tags. */
interface UnresolvedCardSummary {
  cardId:                 string
  firstMissingSourceTag:  number
  missingOccurrenceCount: number
  missingSourceTagCount:  number
  missingKinds:           MissingKind[]
}

/** Per-sourceTag summary used to locate the earliest broken revisions. */
interface PerTagSummary {
  sourceTag:                 number
  missingEntityCount:        number
  missingCardIdCount:        number
  uniqueResolvableCardCount: number
  conflictingCardCount:      number
  unresolvedCardCount:       number
}

/** Full JSON report written by the analyzer. */
interface AnalysisReport {
  generatedAt:                   string
  repoPath:                      string
  scannedTagCount:               number
  firstScannedSourceTag:         number | null
  lastScannedSourceTag:          number | null
  tagsWithMissingDbfId:          number
  missingEntityOccurrenceCount:  number
  missingCardIdCount:            number
  missingKindCounts:             Record<MissingKind, number>
  uniqueResolvableCardIdCount:   number
  conflictingCardIdCount:        number
  unresolvedCardIdCount:         number
  perTag:                        PerTagSummary[]
  resolvable:                    ResolvableCardSummary[]
  conflicting:                   ConflictingCardSummary[]
  unresolved:                    UnresolvedCardSummary[]
}

/** Parsed dbfId state for one Entity start tag. */
interface ParsedDbfId {
  kind:  MissingKind | 'positive'
  dbfId: number | null
}

/** Internal missing aggregation state for one cardId. */
interface MutableMissingCardState {
  firstMissingSourceTag: number
  occurrenceCount:       number
  sourceTags:            Set<number>
  kinds:                 Set<MissingKind>
}

/** Internal positive aggregation state for one cardId. */
interface MutablePositiveCardState {
  dbfIds:          Set<number>
  firstSourceTag:  number
  lastSourceTag:   number
  resolvedSources: Set<number>
}

/** Internal per-tag aggregation state before classification is finalized. */
interface MutablePerTagState {
  occurrenceCount: number
  cardIds:         Set<string>
}

const defaultOutputDir = 'output/hsdata-legacy-dbf-id-analysis'

const attributePattern = /([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/g

/** Usage text for the analyzer command line. */
function printUsage() {
  console.log(`
Analyze hsdata git tags for Entity nodes that are missing positive dbfId values.

The report classifies each missing cardId into:
  - statically resolvable: exactly one positive dbfId appears in later history
  - conflicting: multiple positive dbfId values appear in later history
  - unresolved: no positive dbfId appears in scanned history

Usage:
  bun scripts/analyze-hsdata-missing-dbf-ids.ts --repo <hsdata-repo> [--out <dir>]

Options:
  --repo <path>     Local hsdata git repository path
  --out <dir>       Output directory (default: ${defaultOutputDir})
  --from <tag>      Inclusive minimum numeric sourceTag to scan
  --to <tag>        Inclusive maximum numeric sourceTag to scan
  --limit <count>   Scan only the first N filtered tags
  --help            Show this message

Examples:
  bun scripts/analyze-hsdata-missing-dbf-ids.ts --repo /path/to/hsdata
  bun scripts/analyze-hsdata-missing-dbf-ids.ts --repo /path/to/hsdata --from 10784 --to 10833
`.trim())
}

/** Error helper that stops the script with one clear message. */
function fail(message: string): never {
  throw new Error(message)
}

/** String flag value pulled from the current argument index. */
function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flag}`)
  }

  return value
}

/** Safe integer parser for numeric sourceTag command line filters. */
function parseNonNegativeInteger(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    fail(`${flag} must be a non-negative integer`)
  }

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(`${flag} must be a non-negative integer`)
  }

  return parsed
}

/** Parsed command line options with defaults applied. */
function parseArgs(args: string[]): Options {
  let repoPath = ''
  let outputDir = defaultOutputDir
  let fromTag: number | null = null
  let toTag: number | null = null
  let limit: number | null = null

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    switch (arg) {
    case '--repo':
      repoPath = takeValue(args, index, arg)
      index += 1
      break
    case '--out':
      outputDir = takeValue(args, index, arg)
      index += 1
      break
    case '--from':
      fromTag = parseNonNegativeInteger(takeValue(args, index, arg), arg)
      index += 1
      break
    case '--to':
      toTag = parseNonNegativeInteger(takeValue(args, index, arg), arg)
      index += 1
      break
    case '--limit':
      limit = parseNonNegativeInteger(takeValue(args, index, arg), arg)
      if (limit === 0) {
        fail('--limit must be greater than 0')
      }
      index += 1
      break
    default:
      fail(`Unknown argument: ${arg}`)
    }
  }

  if (repoPath.length === 0) {
    fail('Missing --repo <hsdata-repo>')
  }

  const resolvedRepoPath = resolve(repoPath)

  if (!existsSync(resolvedRepoPath)) {
    fail(`Repo path does not exist: ${resolvedRepoPath}`)
  }

  if (fromTag != null && toTag != null && fromTag > toTag) {
    fail('--from must be less than or equal to --to')
  }

  return {
    repoPath:  resolvedRepoPath,
    outputDir: resolve(outputDir),
    fromTag,
    toTag,
    limit,
  }
}

/** UTF-8 output decoded from one spawned process result. */
function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim()
}

/** Git command executed inside the hsdata repository and returned as text. */
function runGit(repoPath: string, args: string[]): string {
  const result = Bun.spawnSync(['git', '-C', repoPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    const stderr = decodeOutput(result.stderr)
    fail(`git ${args.join(' ')} failed: ${stderr || `exit ${result.exitCode}`}`)
  }

  return decodeOutput(result.stdout)
}

/** Numeric hsdata tags loaded in ascending version order. */
function loadTagRefs(repoPath: string): TagRef[] {
  const output = runGit(repoPath, ['tag', '--sort=version:refname'])

  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(name => {
      if (!/^\d+$/.test(name)) {
        return null
      }

      const sourceTag = Number(name)

      if (!Number.isSafeInteger(sourceTag)) {
        return null
      }

      return {
        name,
        sourceTag,
      } satisfies TagRef
    })
    .filter((value): value is TagRef => value != null)
}

/** Tag list narrowed by the requested numeric sourceTag range. */
function filterTagRefs(tags: TagRef[], options: Options): TagRef[] {
  const filtered = tags.filter(tag => {
    if (options.fromTag != null && tag.sourceTag < options.fromTag) {
      return false
    }

    if (options.toTag != null && tag.sourceTag > options.toTag) {
      return false
    }

    return true
  })

  return options.limit == null
    ? filtered
    : filtered.slice(0, options.limit)
}

/** XML attribute map extracted from one Entity start tag fragment. */
function parseAttributes(fragment: string): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (const match of fragment.matchAll(attributePattern)) {
    const [, name, value] = match

    if (!name) {
      continue
    }

    attributes[name] = value ?? ''
  }

  return attributes
}

/** dbfId state parsed from one Entity.ID attribute value. */
function parseDbfId(rawValue: string | undefined): ParsedDbfId {
  if (rawValue == null) {
    return { kind: 'missing', dbfId: null }
  }

  const value = rawValue.trim()

  if (value.length === 0) {
    return { kind: 'missing', dbfId: null }
  }

  if (!/^\d+$/.test(value)) {
    return { kind: 'invalid', dbfId: null }
  }

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { kind: 'zero', dbfId: null }
  }

  return { kind: 'positive', dbfId: parsed }
}

/** Mutable missing-card state updated with one occurrence. */
function mergeMissingOccurrence(
  state: Map<string, MutableMissingCardState>,
  sourceTag: number,
  cardId: string,
  kind: MissingKind,
) {
  const existing = state.get(cardId)

  if (!existing) {
    state.set(cardId, {
      firstMissingSourceTag: sourceTag,
      occurrenceCount:       1,
      sourceTags:            new Set([sourceTag]),
      kinds:                 new Set([kind]),
    })
    return
  }

  existing.firstMissingSourceTag = Math.min(existing.firstMissingSourceTag, sourceTag)
  existing.occurrenceCount += 1
  existing.sourceTags.add(sourceTag)
  existing.kinds.add(kind)
}

/** Mutable positive-card state updated with one resolved dbfId observation. */
function mergePositiveOccurrence(
  state: Map<string, MutablePositiveCardState>,
  sourceTag: number,
  cardId: string,
  dbfId: number,
) {
  const existing = state.get(cardId)

  if (!existing) {
    state.set(cardId, {
      dbfIds:          new Set([dbfId]),
      firstSourceTag:  sourceTag,
      lastSourceTag:   sourceTag,
      resolvedSources: new Set([sourceTag]),
    })
    return
  }

  existing.dbfIds.add(dbfId)
  existing.firstSourceTag = Math.min(existing.firstSourceTag, sourceTag)
  existing.lastSourceTag = Math.max(existing.lastSourceTag, sourceTag)
  existing.resolvedSources.add(sourceTag)
}

/** Mutable per-tag state updated with one missing occurrence. */
function mergePerTagOccurrence(
  state: Map<number, MutablePerTagState>,
  sourceTag: number,
  cardId: string,
) {
  const existing = state.get(sourceTag)

  if (!existing) {
    state.set(sourceTag, {
      occurrenceCount: 1,
      cardIds:         new Set([cardId]),
    })
    return
  }

  existing.occurrenceCount += 1
  existing.cardIds.add(cardId)
}

/** Stable sorted list built from one numeric set. */
function sortNumberSet(values: Set<number>): number[] {
  return [...values].sort((left, right) => left - right)
}

/** Stable sorted list built from one string set. */
function sortStringSet(values: Set<string>): string[] {
  return [...values].sort()
}

/** Immutable missing-card summary built from internal state. */
function buildMissingCardSummary(cardId: string, state: MutableMissingCardState): MissingCardSummary {
  return {
    cardId,
    firstMissingSourceTag:  state.firstMissingSourceTag,
    missingOccurrenceCount: state.occurrenceCount,
    missingSourceTagCount:  state.sourceTags.size,
    missingKinds:           sortStringSet(new Set(state.kinds)) as MissingKind[],
  }
}

/** Immutable positive-card summary built from internal state. */
function buildPositiveCardSummary(cardId: string, state: MutablePositiveCardState): PositiveCardSummary {
  return {
    cardId,
    candidateDbfIds:        sortNumberSet(state.dbfIds),
    firstResolvedSourceTag: state.firstSourceTag,
    lastResolvedSourceTag:  state.lastSourceTag,
    resolvedSourceTagCount: state.resolvedSources.size,
  }
}

/** Full report assembled from scanned tag history. */
function buildReport(
  options: Options,
  scannedTags: TagRef[],
  missingState: Map<string, MutableMissingCardState>,
  positiveState: Map<string, MutablePositiveCardState>,
  perTagState: Map<number, MutablePerTagState>,
  missingKindCounts: Record<MissingKind, number>,
): AnalysisReport {
  const missingCards = [...missingState.entries()]
    .map(([cardId, state]) => buildMissingCardSummary(cardId, state))
    .sort((left, right) => left.firstMissingSourceTag - right.firstMissingSourceTag || left.cardId.localeCompare(right.cardId))

  const positiveCards = new Map(
    [...positiveState.entries()]
      .map(([cardId, state]) => [cardId, buildPositiveCardSummary(cardId, state)]),
  )

  const resolvable: ResolvableCardSummary[] = []
  const conflicting: ConflictingCardSummary[] = []
  const unresolved: UnresolvedCardSummary[] = []
  const classificationByCardId = new Map<string, 'resolvable' | 'conflicting' | 'unresolved'>()

  for (const missingCard of missingCards) {
    const positiveCard = positiveCards.get(missingCard.cardId)

    if (!positiveCard) {
      unresolved.push({
        cardId:                 missingCard.cardId,
        firstMissingSourceTag:  missingCard.firstMissingSourceTag,
        missingOccurrenceCount: missingCard.missingOccurrenceCount,
        missingSourceTagCount:  missingCard.missingSourceTagCount,
        missingKinds:           missingCard.missingKinds,
      })
      classificationByCardId.set(missingCard.cardId, 'unresolved')
      continue
    }

    if (positiveCard.candidateDbfIds.length === 1) {
      resolvable.push({
        cardId:                 missingCard.cardId,
        dbfId:                  positiveCard.candidateDbfIds[0]!,
        firstMissingSourceTag:  missingCard.firstMissingSourceTag,
        missingOccurrenceCount: missingCard.missingOccurrenceCount,
        missingSourceTagCount:  missingCard.missingSourceTagCount,
        firstResolvedSourceTag: positiveCard.firstResolvedSourceTag,
        lastResolvedSourceTag:  positiveCard.lastResolvedSourceTag,
        resolvedSourceTagCount: positiveCard.resolvedSourceTagCount,
        missingKinds:           missingCard.missingKinds,
      })
      classificationByCardId.set(missingCard.cardId, 'resolvable')
      continue
    }

    conflicting.push({
      cardId:                 missingCard.cardId,
      firstMissingSourceTag:  missingCard.firstMissingSourceTag,
      missingOccurrenceCount: missingCard.missingOccurrenceCount,
      missingSourceTagCount:  missingCard.missingSourceTagCount,
      candidateDbfIds:        positiveCard.candidateDbfIds,
      firstResolvedSourceTag: positiveCard.firstResolvedSourceTag,
      lastResolvedSourceTag:  positiveCard.lastResolvedSourceTag,
      resolvedSourceTagCount: positiveCard.resolvedSourceTagCount,
      missingKinds:           missingCard.missingKinds,
    })
    classificationByCardId.set(missingCard.cardId, 'conflicting')
  }

  const perTag: PerTagSummary[] = [...perTagState.entries()]
    .map(([sourceTag, state]) => {
      let uniqueResolvableCardCount = 0
      let conflictingCardCount = 0
      let unresolvedCardCount = 0

      for (const cardId of state.cardIds) {
        const classification = classificationByCardId.get(cardId)

        if (classification === 'resolvable') {
          uniqueResolvableCardCount += 1
          continue
        }

        if (classification === 'conflicting') {
          conflictingCardCount += 1
          continue
        }

        unresolvedCardCount += 1
      }

      return {
        sourceTag,
        missingEntityCount:        state.occurrenceCount,
        missingCardIdCount:        state.cardIds.size,
        uniqueResolvableCardCount,
        conflictingCardCount,
        unresolvedCardCount,
      }
    })
    .sort((left, right) => left.sourceTag - right.sourceTag)

  return {
    generatedAt:                  new Date().toISOString(),
    repoPath:                     options.repoPath,
    scannedTagCount:              scannedTags.length,
    firstScannedSourceTag:        scannedTags[0]?.sourceTag ?? null,
    lastScannedSourceTag:         scannedTags.at(-1)?.sourceTag ?? null,
    tagsWithMissingDbfId:         perTag.length,
    missingEntityOccurrenceCount: missingCards.reduce((sum, card) => sum + card.missingOccurrenceCount, 0),
    missingCardIdCount:           missingCards.length,
    missingKindCounts,
    uniqueResolvableCardIdCount:  resolvable.length,
    conflictingCardIdCount:       conflicting.length,
    unresolvedCardIdCount:        unresolved.length,
    perTag,
    resolvable,
    conflicting,
    unresolved,
  }
}

/** Static cardId-to-dbfId map extracted from uniquely resolvable results. */
function buildResolvableMap(report: AnalysisReport): Record<string, number> {
  return Object.fromEntries(
    report.resolvable.map(item => [item.cardId, item.dbfId]),
  )
}

/** Report files written to disk for later static review and reuse. */
async function writeReportFiles(report: AnalysisReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true })

  await writeFile(
    resolve(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    resolve(outputDir, 'resolvable-map.json'),
    `${JSON.stringify(buildResolvableMap(report), null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    resolve(outputDir, 'resolvable.json'),
    `${JSON.stringify(report.resolvable, null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    resolve(outputDir, 'conflicting.json'),
    `${JSON.stringify(report.conflicting, null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    resolve(outputDir, 'unresolved.json'),
    `${JSON.stringify(report.unresolved, null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    resolve(outputDir, 'per-tag.json'),
    `${JSON.stringify(report.perTag, null, 2)}\n`,
    'utf8',
  )
}

/** Console summary kept short enough for one interactive run. */
function printSummary(report: AnalysisReport, outputDir: string) {
  const topTags = report.perTag.slice(0, 10)
  const sampleConflicts = report.conflicting.slice(0, 10)
  const sampleUnresolved = report.unresolved.slice(0, 10)

  console.log(`Scanned tags: ${report.scannedTagCount}`)
  console.log(`Scanned range: ${report.firstScannedSourceTag ?? '-'} -> ${report.lastScannedSourceTag ?? '-'}`)
  console.log(`Tags with missing dbfId: ${report.tagsWithMissingDbfId}`)
  console.log(`Missing entity occurrences: ${report.missingEntityOccurrenceCount}`)
  console.log(`Missing cardIds: ${report.missingCardIdCount}`)
  console.log(`Missing kinds: missing=${report.missingKindCounts.missing}, zero=${report.missingKindCounts.zero}, invalid=${report.missingKindCounts.invalid}`)
  console.log(`Uniquely resolvable cardIds: ${report.uniqueResolvableCardIdCount}`)
  console.log(`Conflicting cardIds: ${report.conflictingCardIdCount}`)
  console.log(`Unresolved cardIds: ${report.unresolvedCardIdCount}`)
  console.log(`Output directory: ${outputDir}`)

  if (topTags.length > 0) {
    console.log('\nEarliest tags with missing dbfId:')

    for (const tag of topTags) {
      console.log(
        `  ${tag.sourceTag}: missingEntities=${tag.missingEntityCount}, missingCardIds=${tag.missingCardIdCount}, resolvable=${tag.uniqueResolvableCardCount}, conflicting=${tag.conflictingCardCount}, unresolved=${tag.unresolvedCardCount}`,
      )
    }
  }

  if (sampleConflicts.length > 0) {
    console.log('\nConflict samples:')

    for (const item of sampleConflicts) {
      console.log(
        `  ${item.cardId}: candidates=${item.candidateDbfIds.join(',')} firstMissing=${item.firstMissingSourceTag}`,
      )
    }
  }

  if (sampleUnresolved.length > 0) {
    console.log('\nUnresolved samples:')

    for (const item of sampleUnresolved) {
      console.log(
        `  ${item.cardId}: firstMissing=${item.firstMissingSourceTag} missingTags=${item.missingSourceTagCount}`,
      )
    }
  }
}

/** Entity start tags read from one git revision without loading the full XML document. */
function loadEntityLines(repoPath: string, tagName: string): string[] {
  const output = runGit(repoPath, ['grep', '-h', '-e', '<Entity', tagName, '--', 'CardDefs.xml'])

  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/** Main analyzer flow that scans git history and writes the report artifacts. */
async function main() {
  const options = parseArgs(process.argv.slice(2))
  const tagRefs = filterTagRefs(loadTagRefs(options.repoPath), options)

  if (tagRefs.length === 0) {
    fail('No numeric hsdata tags matched the requested filters')
  }

  const missingState = new Map<string, MutableMissingCardState>()
  const positiveState = new Map<string, MutablePositiveCardState>()
  const perTagState = new Map<number, MutablePerTagState>()
  const missingKindCounts: Record<MissingKind, number> = {
    missing: 0,
    zero:    0,
    invalid: 0,
  }

  for (const [index, tag] of tagRefs.entries()) {
    if (index % 25 === 0 || index === tagRefs.length - 1) {
      console.error(`[hsdata-dbf-analyze] scanning ${index + 1}/${tagRefs.length}: ${tag.sourceTag}`)
    }

    const lines = loadEntityLines(options.repoPath, tag.name)

    for (const line of lines) {
      const startIndex = line.indexOf('<Entity')

      if (startIndex < 0) {
        continue
      }

      const endIndex = line.indexOf('>', startIndex)

      if (endIndex < 0) {
        continue
      }

      const fragment = line.slice(startIndex + '<Entity'.length, endIndex)
      const attributes = parseAttributes(fragment)
      const cardId = attributes.CardID?.trim() ?? ''

      if (cardId.length === 0) {
        continue
      }

      const parsedDbfId = parseDbfId(attributes.ID)

      if (parsedDbfId.kind === 'positive' && parsedDbfId.dbfId != null) {
        mergePositiveOccurrence(positiveState, tag.sourceTag, cardId, parsedDbfId.dbfId)
        continue
      }

      mergeMissingOccurrence(missingState, tag.sourceTag, cardId, parsedDbfId.kind)
      mergePerTagOccurrence(perTagState, tag.sourceTag, cardId)
      missingKindCounts[parsedDbfId.kind] += 1
    }
  }

  const report = buildReport(
    options,
    tagRefs,
    missingState,
    positiveState,
    perTagState,
    missingKindCounts,
  )

  await writeReportFiles(report, options.outputDir)
  printSummary(report, options.outputDir)
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
