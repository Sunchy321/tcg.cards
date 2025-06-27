import { Client } from '@elastic/elasticsearch';

import { config } from '@/config';

export const elastic = new Client({
    node: config.elastic.node,
    auth: {
        apiKey: config.elastic.apiKey,
    },
});
