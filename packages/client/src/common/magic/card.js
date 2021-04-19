import Dexie from 'dexie';
import debounce from 'debounce-promise';

import { api } from 'src/boot/backend';

const card = new Dexie('magic/card/profile');

card.version(1).stores({
    profile: '&cardId',
});

card.open();

async function getRemote(args) {
    const ids = args.map(a => a[0]);

    const { data } = await api.get('/magic/card/profile', { params: { id: ids.join(',') } });

    const result = [];

    for (const id of ids) {
        result.push(data[id]);

        if (data[id] != null) {
            await card.profile.put(data[id]);
        }
    }

    return result;
}

const debouncedGetRemote = debounce(getRemote, 100, { accumulate: true });

function getProfile(id) {
    const local = card.profile.get({ cardId: id });

    const remote = debouncedGetRemote(id);

    return { local, remote };
};

export { getProfile };
