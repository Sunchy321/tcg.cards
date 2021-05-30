import { createLogger, format, transports } from 'winston';
import { TransformableInfo } from 'logform';

import { logPath } from '@static';

function formatter(info: TransformableInfo) {
    const level = info.level[0];
    const tag = info.category != null ? level + '/' + info.category : level;

    return `${info.timestamp} ${tag.padEnd(10, ' ').toUpperCase()} ${
        info.message
    }`;
}

export const main = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: logPath + '/main.log',
        }),
    ],
});

export const data = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: logPath + '/data.log',
        }),
    ],
});

export const user = createLogger({
    level:      'info',
    format:     format.combine(format.timestamp(), format.printf(formatter)),
    transports: [
        new transports.File({
            filename: logPath + '/user.log',
        }),
    ],
});
