import { createLogger, format, transports } from 'winston';
import { TransformableInfo } from 'logform';

import { log } from '../config';

function formatter(info) {
    const level = info.level[0];
    const tag = info.category != null ? level + '/' + info.category : level;

    return `${info.timestamp} ${tag.padEnd(10, ' ').toUpperCase()} ${info.message}`;
}

const main = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(formatter),
    ),
    transports: [
        new transports.File({
            filename: log + '/main.log',
        }),
    ],
});

const bulk = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(formatter),
    ),
    transports: [
        new transports.File({
            filename: log + '/bulk.log',
        }),
    ],
});

export { main, bulk };
