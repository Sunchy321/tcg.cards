import type { DocumentMeta, DocumentSettings, SourceFile, TextMarker, TranslationMethod, ReviewStatus } from '@tcg-cards/model/magic/schema/document-content';
import type { NodeKind } from '@tcg-cards/model/magic/schema/document';

/** Stores one document identity independently of its saved content. */
export interface Document {
  id: string;
  slug: string;
  title: string;
  sourceLanguage: string;
  origin: 'static' | 'user';
  staticKey: string | null;
  authorId?: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  settings: DocumentSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Preserves one node's text, annotations, and exact translation source. */
export interface Node {
  id: string;
  revisionId: string;
  nodeKey: string;
  kind: NodeKind;
  anchor: string | null;
  path: string;
  level: number;
  parentId: string | null;
  siblingOrder: number;
  rawText: string;
  markers: TextMarker[];
  sourceNodeId: string | null;
  sourceRevisionId: string | null;
  translationMethod: TranslationMethod | null;
  reviewStatus: ReviewStatus | null;
}

/** Saves authored content or the selected public content of an imported source. */
export interface Revision {
  id: string;
  documentId: string;
  translationId: string | null;
  sourceRevisionId: string | null;
  title: string;
  language: string;
  createdAt: Date;
  deletedAt: Date | null;
  nodes: Node[];
  meta?: DocumentMeta;
  contentHash?: string | null;
}

/** Identifies the only translation in one target language. */
export interface Translation {
  id: string;
  documentId: string;
  language: string;
}

/** Selects source content for an intentional public edition. */
export interface Release {
  id: string;
  documentId: string;
  versionTag: string;
  sourceRevisionId: string;
  publishedAt: Date;
  effectiveDate: string | null;
  files: SourceFile[];
  deletedAt: Date | null;
}

/** Selects a translation revision without creating another public edition. */
export interface ReleaseTranslation {
  documentId: string;
  sourceRevisionId: string;
  releaseId: string;
  translationId: string;
  revisionId: string;
}

/** Return readable text only from the currently published source or selected translation. */
export interface SearchHit {
  documentId: string;
  slug: string;
  title: string;
  releaseId: string;
  versionTag: string;
  nodeId: string;
  nodeKey: string;
  anchor: string | null;
  rawText: string;
  language: string;
  markers: TextMarker[];
}

/** Bound public search without exposing intermediate revisions. */
export interface SearchInput {
  query: string;
  slug?: string;
  language?: string;
  limit: number;
}

/** Bind one complete comparison to exact neighboring published revisions. */
export interface Adjacency {
  id: string;
  documentId: string;
  fromReleaseId: string;
  toReleaseId: string;
  fromRevisionId: string;
  toRevisionId: string;
  fromHash: string;
  toHash: string;
  algorithm: string;
  timelineHash: string;
}

/** Preserve every participant, including unchanged one-to-one continuations. */
export interface NodeRelation {
  comparisonId: string;
  groupId: string;
  side: 'from' | 'to';
  nodeId: string;
  identity: string;
  itemId: string;
  kind: import('@tcg-cards/model/magic/schema/document').NodeChangeType | 'unchanged';
  position: number;
}

/** Select a small reachable subset of persisted relation participants. */
export interface RelationQuery {
  comparisonIds: string[];
  nodeIds?: string[];
  identities?: string[];
  groups?: { comparisonId: string; groupId: string }[];
}

/** Persists document operations transactionally without exposing SQL to callers. */
export interface DocumentStore {
  /** Read source metadata without loading revision nodes. */
  revisionHeaders(ids: string[]): Promise<Omit<Revision, 'nodes'>[]>;
  /** Select exact nodes, published entry addresses, or translation source references. */
  selectNodes(input: { revisionIds: string[]; ids?: string[]; itemId?: string; sourceNodeIds?: string[] }): Promise<Node[]>;
  /** Backfill a verified content fingerprint during explicit preparation. */
  setRevisionHash(id: string, hash: string): Promise<void>;
  /** Remove superseded derived boundaries without touching retained review comparisons. */
  pruneAdjacencies(documentId: string, keepIds: string[]): Promise<void>;
  adjacencies(documentId: string): Promise<Adjacency[]>;
  adjacencyRelations(comparisonIds: string[]): Promise<NodeRelation[]>;
  putAdjacency(comparison: Adjacency, relations: NodeRelation[]): Promise<void>;
  nodeRelations(query: RelationQuery): Promise<NodeRelation[]>;
  searchPublished(input: SearchInput): Promise<SearchHit[]>;
  transaction<T>(documentId: string, operation: (store: DocumentStore) => Promise<T>): Promise<T>;
  documents(): Promise<Document[]>;
  document(id: string): Promise<Document | undefined>;
  putDocument(document: Document): Promise<void>;
  revisions(documentId: string): Promise<Omit<Revision, 'nodes'>[]>;
  revision(id: string): Promise<Revision | undefined>;
  /** Counts saved nodes in the requested revisions without reading their content. */
  revisionNodeCounts(revisionIds: string[]): Promise<Map<string, number>>;
  putRevision(revision: Revision): Promise<void>;
  /** Updates derived metadata without modifying saved text or its references. */
  updateRevisionMeta(id: string, meta: DocumentMeta): Promise<void>;
  /** Rebuilds an imported public source's parsing without creating an editing revision. */
  reparseRevision(revision: Revision, options?: { dryRun?: boolean }): Promise<void>;
  hideRevision(id: string, at: Date): Promise<void>;
  translations(documentId: string): Promise<Translation[]>;
  putTranslation(translation: Translation): Promise<void>;
  releases(documentId: string): Promise<Release[]>;
  putRelease(release: Release): Promise<void>;
  releaseTranslations(releaseId: string): Promise<ReleaseTranslation[]>;
  putReleaseTranslation(binding: ReleaseTranslation): Promise<void>;
}
