export const documentConfigs = {
  'magic-cr': {
    id:             'magic-cr',
    slug:           'magic-cr',
    name:           'Comprehensive Rules',
    game:           'magic',
    sourceLocale:   'en',
    parserStrategy: 'magic-cr-txt-v1',
  },
} as const;

export type DocumentId = keyof typeof documentConfigs;

export function getDocumentConfig(documentId: string) {
  return documentConfigs[documentId as DocumentId] ?? null;
}
