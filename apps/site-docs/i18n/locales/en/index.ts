export default {
  nav: { intro: 'Introduction', model: 'Models', overview: 'Overview', on_this_page: 'On this page' },
  portal: {
    eyebrow: 'Developer documentation', title: 'Build with trading card data.', description: 'Detailed API contracts for card games, generated from the same schemas that validate every response.',
    contract_title: 'Endpoint contracts', contract_description: 'One focused page per endpoint, with its complete request and response contract.',
    schema_title: 'Schema first', schema_description: 'Nested card models remain fully expanded so field context is never hidden.',
    version_title: 'Stable versioning', version_description: 'Every canonical documentation URL is pinned to the v1 API contract.',
  },
  games: {
    magic: { description: 'Cards, prints, sets, formats, announcements, and catalogs for Magic: The Gathering.' },
    hearthstone: { description: 'Cards, sets, patches, formats, tags, and catalogs for Hearthstone.' },
  },
  reference: { input: 'Input schema', output: 'Output schema', resources: 'API resources' },
  schema: { field: 'Field', type: 'Type & constraints', description: 'Description', optional: 'optional', required: 'required', default: 'Default', description_pending: 'Field description will be supplied by localized model metadata.' },
  model: { description: 'Complete output schemas for this resource, derived from the public API contract.' },
};
