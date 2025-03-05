import { createLogger, format, transports } from 'winston';

import { logPath } from '@/config';

import { formatter } from '@/logger';

export const updation = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: `${logPath}/hearthstone/updation.log`,
        }),
    ],
});

export const loadPatch = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: `${logPath}/hearthstone/load-patch.log`,
        }),
    ],
});

export const createAdjustmentJson = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: `${logPath}/hearthstone/create-adjustment-json.log`,
        }),
    ],
});
