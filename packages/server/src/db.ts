import { Connection, createConnection, set } from 'mongoose';

import { mongodb } from '@static';

set('useCreateIndex', true);

export function connect(dbName: string): Connection {
    const { host } = mongodb;
    const dbInfo = mongodb.database[dbName];

    let conn: Connection;

    if (dbInfo != null) {
        conn = createConnection(`mongodb://${host}/${dbName}`, {
            user:               dbInfo.user,
            pass:               dbInfo.password,
            useNewUrlParser:    true,
            useUnifiedTopology: true,
        });
    } else {
        conn = createConnection(`mongodb://${host}/${dbName}`, {
            useNewUrlParser:    true,
            useUnifiedTopology: true,
        });
    }

    conn.once('open', () => {
        console.log(`database ${dbName} is connected`);
    });

    return conn;
}
