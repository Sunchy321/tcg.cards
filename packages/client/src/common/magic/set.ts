import Dexie, { Table } from 'dexie';
import debounce from 'debounce-promise';

import { api } from 'boot/backend';

export interface SetLocalization {
    name?: string,
    isOfficialName: boolean,
    link?: string,
}

export interface SetProfile {
    setId: string,
    parent?: string,
    localization: Record<string, SetLocalization>,
    setType: string,
    releaseDate?: string,
}

class Set extends Dexie {
    profile: Table<SetProfile, string>;

    constructor() {
        super('magic/set/profile');

        this.version(1).stores({
            profile: '&setId',
        });

        this.profile = this.table('profile');
    }
}

const set = new Set();

void set.open();

async function getRemote(args: [string][]): Promise<SetProfile[]> {
    const ids = args.map(a => a[0]);

    const { data } = await api.get<Record<string, SetProfile>>('/magic/set/profile', { params: { id: ids.join(',') } });

    const result = [];

    for (const id of ids) {
        result.push(data[id]);

        if (data[id] != null) {
            await set.profile.put(data[id]);
        }
    }

    return result;
}

const debouncedGetRemote = debounce(getRemote, 100, { accumulate: true }) as
    unknown as (id: string) => Promise<SetProfile>;

function getProfile(id: string) {
    const local = set.profile.get({ setId: id });

    const remote = debouncedGetRemote(id);

    return { local, remote };
}

export { getProfile };
