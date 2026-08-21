import magic from './magic';
import hearthstone from './hearthstone';

export default {
  nav: {
    intro:        'Introduction',
    model:        'Model',
    overview:     'Overview',
    on_this_page: 'On this page',
    changelog:    'Changelog',
    guide:        'Guide',
    settings:     'Settings',
  },
  portal: {
    title:       'API Documentation',
    description: 'Reference documentation for the TCG.CARDS data APIs.',
  },
  reference: {
    input:     'Input schema',
    output:    'Output schema',
    resources: 'API resources',
    endpoints: '{n} endpoints',
  },
  schema: {
    field:               'Field',
    type:                'Type & constraints',
    description:         'Description',
    optional:            'optional',
    required:            'required',
    default:             'Default',
    description_pending: 'No description available for this field.',
  },
  model: {
    description: 'Fields and types returned by this resource.',
  },
  settings: {
    todo: 'TODO: API key management (login required).',
  },
  search: {
    placeholder: 'Search…',
    endpoints:   'Endpoints',
    fields:      'Fields',
    enums:       'Enums',
  },
  magic,
  hearthstone,
};
