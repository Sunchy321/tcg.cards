import { Connection, createConnection } from 'mongoose';

import { mongodb } from '@/config';

export function connect(dbName: string): Connection {
    const { host } = mongodb;
    const dbInfo = mongodb.database[dbName];

    let conn: Connection;

    if (dbInfo != null) {
        conn = createConnection(`mongodb://${host}/${dbName}`, {
            user: dbInfo.user,
            pass: dbInfo.password,
        });
    } else {
        conn = createConnection(`mongodb://${host}/${dbName}`, {
        });
    }

    conn.once('open', () => {
        console.log(`database ${dbName} is connected`);
    });

    return conn;
}
