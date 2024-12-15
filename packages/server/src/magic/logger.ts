import { createLogger, format, transports } from 'winston';

import { logPath } from '@/config';

import { formatter } from '@/logger';

export const updation = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: `${logPath}/magic/updation.log`,
        }),
    ],
});

export const bulkUpdation = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: `${logPath}/magic/bulk-updation.log`,
        }),
    ],
});
