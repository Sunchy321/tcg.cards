import git from 'nodegit';

import fs from 'fs';
import path from 'path';

import { data } from '@/config';
import logger from '@/logger';

const remoteUrl = 'https://github.com/HearthSim/hsdata';
const localPath = path.join(data, 'hearthstone', 'hsdata');

const messagePrefix = 'Update to patch';

async function syncData() {
    if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
    }

    if (!fs.existsSync(path.join(localPath, '.git'))) {
        await git.Clone(remoteUrl, localPath);

        logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
    } else {
        const repo = await git.Repository.open(localPath);

        await repo.fetchAll();
        await repo.mergeBranches('master', 'origin/master');

        logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
    }
}

export async function patches() {
    const repo = await git.Repository.open(localPath);

    const walker = git.Revwalk.create(repo);

    walker.pushHead();

    const commits = await walker.getCommitsUntil(c => (
        c.message().startsWith(messagePrefix)
    ));

    return commits.slice(0, -1).map(c => ({
        sha: c.sha(),
        version: c.message().slice(messagePrefix.length).trim()
    }));
}

export async function switchPatch(version) {
    syncData();
}