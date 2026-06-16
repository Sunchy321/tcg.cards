export const desktopConfigSchema = {
  type:                 'object',
  additionalProperties: true,
  properties:           {
    version: {
      type:        'number',
      description: 'Desktop config version.',
    },
    externalDatabaseConnectionString: {
      type:        'string',
      description: 'External PostgreSQL connection string used by the desktop app.',
    },
    games: {
      type:                 'object',
      additionalProperties: true,
      properties:           {
        hearthstone: {
          type:                 'object',
          additionalProperties: true,
          properties:           {
            hsdata: {
              type:                 'object',
              additionalProperties: true,
              properties:           {
                repoPath: {
                  type:        'string',
                  description: 'Local hsdata repository path.',
                },
              },
            },
            publish: {
              type:                 'object',
              additionalProperties: true,
              properties:           {
                publishTarget: {
                  type:        'string',
                  description: 'Bound publish target identifier.',
                },
                environment: {
                  type:        'string',
                  description: 'Publish target environment key.',
                },
                targetFingerprint: {
                  type:        'string',
                  description: 'Fingerprint of the expected publish target.',
                },
              },
            },
            image: {
              type:                 'object',
              additionalProperties: true,
              properties:           {
                rendererBaseUrl: {
                  type:        'string',
                  description: 'Local Hearthstone image renderer base URL.',
                },
                bucketDir: {
                  type:        'string',
                  description: 'Local Hearthstone image bucket directory.',
                },
              },
            },
          },
        },
        magic: {
          type:                 'object',
          additionalProperties: true,
          description:          'Game-specific desktop settings for Magic.',
        },
      },
    },
  },
};
