import type { DocumentSettings, SourceFile, TextMarker, TranslationMethod, ReviewStatus } from '@tcg-cards/model/magic/schema/document-content';
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

/** Saves a complete immutable article or translation state. */
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

/** Persists document operations transactionally without exposing SQL to callers. */
export interface DocumentStore {
  searchPublished(input: SearchInput): Promise<SearchHit[]>;
  transaction<T>(documentId: string, operation: (store: DocumentStore) => Promise<T>): Promise<T>;
  documents(): Promise<Document[]>;
  document(id: string): Promise<Document | undefined>;
  putDocument(document: Document): Promise<void>;
  revisions(documentId: string): Promise<Omit<Revision, 'nodes'>[]>;
  revision(id: string): Promise<Revision | undefined>;
  putRevision(revision: Revision): Promise<void>;
  hideRevision(id: string, at: Date): Promise<void>;
  translations(documentId: string): Promise<Translation[]>;
  putTranslation(translation: Translation): Promise<void>;
  releases(documentId: string): Promise<Release[]>;
  putRelease(release: Release): Promise<void>;
  releaseTranslations(releaseId: string): Promise<ReleaseTranslation[]>;
  putReleaseTranslation(binding: ReleaseTranslation): Promise<void>;
}
