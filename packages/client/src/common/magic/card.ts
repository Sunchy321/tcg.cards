import Dexie, { Table } from 'dexie';
import debounce from 'debounce-promise';

import { api } from 'boot/backend';

export interface CardProfile {
    cardId: string;

    layout: string;

    parts: {
        localization: {
            lang: string;
            name: string;
        }[]
    }[],

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
        releaseDate: string;
    }[],
}

class Card extends Dexie {
    profile: Table<CardProfile, string>;

    constructor() {
        super('magic/card/profile');

        this.version(1).stores({
            profile: '&cardId',
        });

        this.profile = this.table('profile');
    }
}

const card = new Card();

void card.open();

async function getRemote(args: [string][]): Promise<CardProfile[]> {
    const ids = args.map(a => a[0]);

    const { data } = await api.get<Record<string, CardProfile>>('/magic/card/profile', { params: { id: ids.join(',') } });

    const result = [];

    for (const id of ids) {
        result.push(data[id]);

        if (data[id] != null) {
            await card.profile.put(data[id]);
        }
    }

    return result;
}

const debouncedGetRemote = debounce(getRemote, 100, { accumulate: true }) as
    unknown as (id: string) => Promise<CardProfile>;

function getProfile(id: string) {
    const local = card.profile.get({ cardId: id });

    const remote = debouncedGetRemote(id);

    return { local, remote };
}

export { getProfile };
