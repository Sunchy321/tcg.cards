import * as fs from 'fs';

import { openapiDocument } from '@/router';

fs.writeFileSync(
    './openapi.json',
    JSON.stringify(openapiDocument, null, 4),
);
