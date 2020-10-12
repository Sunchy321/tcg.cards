import { Connection, createConnection, set } from 'mongoose';

import * as logger from '@/logger';

import { database } from '@config';

set('useCreateIndex', true);

export function connect(dbName: string): Connection {
    const ip = database.ip;
    const dbInfo = database?.dbInfo?.[dbName];

    let conn: Connection;

    if (dbInfo?.user && dbInfo?.password) {
        conn = createConnection(`mongodb://${ip}/${dbName}`, {
            user:               dbInfo.user,
            pass:               dbInfo.password,
            useNewUrlParser:    true,
            useUnifiedTopology: true,
        });
    } else {
        conn = createConnection(`mongodb://${ip}/${dbName}`, {
            useNewUrlParser:    true,
            useUnifiedTopology: true,
        });
    }

    conn.once('open', () => {
        logger.main.info(`database ${dbName} is connected`, {
            category: 'database',
        });
    });

    return conn;
}
