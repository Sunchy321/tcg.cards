import Dexie, { Table } from 'dexie';
import debounce from 'debounce-promise';

import { uniq } from 'lodash';

import { api } from 'boot/backend';

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type IndexType<T> = KeysMatching<T, string>;

class Database<T> extends Dexie {
    profile: Table<T & { time: number }, string>;
    constructor(dbName: string, indexKey: IndexType<T>) {
        super(dbName);

        this.version(1).stores({
            profile: `&${indexKey}`,
        });

        this.profile = this.table('profile');
    }
}

const debounceGap = 100;
const expireTime = 24 * 60 * 60 * 1000;

export default function makeProfile<T>(
    dbName: string,
    indexKey: IndexType<T>,
    remoteUrl: string,
): {
        get: (id: string, callback: (value: T) => void) => Promise<void>;
        update: (value: T) => Promise<void>;
    } {
    const db = new Database<T>(dbName, indexKey);

    void db.open();

    const update = async (value: T) => {
        db.profile.put({ ...value, time: Date.now() });
    };

    const getRemote = async (args: [string][]): Promise<T[]> => {
        const ids = args.map(a => a[0]);

        const { data } = await api.get<Record<string, T>>(remoteUrl, {
            params: { ids: uniq(ids).join(',') },
        });

        const result = [];

        for (const id of ids) {
            result.push(data[id]);

            if (data[id] != null) {
                await update(data[id]);
            }
        }

        return result;
    };

    const debouncedGetRemote = debounce(getRemote, debounceGap, { accumulate: true }) as
        unknown as (id: string) => Promise<T>;

    const get = async (id: string, callback: (value: T) => void) => {
        const local = db.profile.get({ [indexKey]: id });

        const localValue = await local;

        if (localValue != null) {
            callback(localValue);

            if (Date.now() - localValue.time < expireTime) {
                return;
            }
        }

        const remoteValue = await debouncedGetRemote(id);

        if (remoteValue != null) {
            callback(remoteValue);
        } else {
            throw new Error('profile not found');
        }
    };

    return { get, update };
}
