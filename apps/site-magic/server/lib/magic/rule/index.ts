// Rule history parser and importer
export {
  parseRuleFile,
  parseAndCompressRuleFile,
  compressContent,
  generateContentHash,
  generateFingerprint,
  type ParsedRuleNode,
  type ParsedRuleSource,
  type CompressedContent,
} from './parser';

export {
  detectChanges,
  matchRule,
  detectSplit,
  detectMerge,
  jaccardSimilarity,
  fingerprintSimilarity,
  exactMatch,
  fingerprintMatch,
  similarityMatch,
  type ChangeType,
  type MatchResult,
  type SplitResult,
  type MergeResult,
} from './matcher';
