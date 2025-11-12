import git, { SimpleGitProgressEvent, ResetMode } from 'simple-git';

import { db } from '@/drizzle';
import { Patch } from '@/hearthstone/schema/patch';
import { Entity, EntityLocalization } from '@/hearthstone/schema/entity';

import Task from '@/common/task';
import { LoaderProgress } from '@model/hearthstone/schema/data/hsdata';

import { Entity as IEntity } from '@interface/hearthstone/entity';

import { eq, max, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import _ from 'lodash';

import { localPath } from './base';

import { main } from '@/hearthstone/logger';

const remoteUrl = 'git@github.com:HearthSim/hsdata.git';

export interface ITag {
    index:   keyof IEntity | 'multiClass';
    bool?:   true;
    array?:  true;
    enum?:   string | true;
    static?: IEntity[keyof IEntity];
}

export class RepoPuller extends Task<SimpleGitProgressEvent & { type: 'get' }> {
    async startImpl(): Promise<void> {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        if (!fs.existsSync(path.join(localPath, '.git'))) {
            await repo.clone(remoteUrl);

            main.info('Hsdata has been cloned', { category: 'hsdata' });
        } else {
            await repo.fetch(['--all']);
            await repo.reset(ResetMode.HARD, ['origin/master']);

            main.info('Hsdata has been pulled', { category: 'hsdata' });
        }
    }

    stopImpl(): void { /* no-op */ }
}

const messagePrefix = 'Update to patch';

export class PatchListLoader extends Task<LoaderProgress> {
    async startImpl(): Promise<void> {
        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        const log = await repo.log();
        const commits = log.all.filter(v => v.message.startsWith(messagePrefix));

        let count = 0;
        const total = commits.length;

        for (const c of commits) {
            const name = c.message.slice(messagePrefix.length).trim();
            const buildNumber = Number.parseInt(_.last(name.split('.'))!, 10);
            const { hash } = c;

            await db.insert(Patch)
                .values({
                    buildNumber,
                    name,
                    shortName: name.replace(/\.\d+$/, ''),
                    hash,
                })
                .onConflictDoUpdate({
                    target: Patch.buildNumber,
                    set:    {
                        name,
                        shortName: name.replace(/\.\d+$/, ''),
                        hash,
                    },
                });

            count += 1;

            this.emit('progress', { type: 'load', count, total });
        }

        // Find max build number
        const result = await db.select({
            maxBuildNumber: max(Patch.buildNumber),
        }).from(Patch);

        const maxBuildNumber = result[0].maxBuildNumber;

        // Update all patches to set isCurrent=false
        await db.update(Patch)
            .set({ isLatest: false });

        // Update the patch with max buildNumber to set isCurrent=true
        if (maxBuildNumber) {
            await db.update(Patch)
                .set({ isLatest: true })
                .where(eq(Patch.buildNumber, maxBuildNumber));
        }

        main.info(`Updated patch ${maxBuildNumber} to be current`, { category: 'hsdata' });

        // const patches = await Patch.find();

        // const maxVersion = Math.max(...patches.map(p => p.number));

        // for (const p of patches) {
        //     if (p.isCurrent && p.number !== maxVersion) {
        //         p.isCurrent = false;

        //         await p.save();
        //     } else if (!p.isCurrent && p.number === maxVersion) {
        //         p.isCurrent = true;

        //         await p.save();
        //     }
        // }
    }

    stopImpl(): void { /* no-op */ }
}

export async function clearPatch(buildNumber: number) {
    const patch = await db.select().from(Patch).where(eq(Patch.buildNumber, buildNumber)).limit(1).then(r => _.last(r));

    if (patch == null) {
        return {
            deletedEntity:             [],
            deletedEntityLocalization: [],
        };
    }

    const result = await db.transaction(async tx => {
        await tx.update(Entity)
            .set({ version: sql`array_remove(${Entity.version}, ${buildNumber.toString()})` })
            .where(sql`${buildNumber} = any(${Entity.version})`);

        await tx.update(EntityLocalization)
            .set({ version: sql`array_remove(${EntityLocalization.version}, ${buildNumber.toString()})` })
            .where(sql`${buildNumber} = any(${EntityLocalization.version})`);

        const deletedEntity = await tx.delete(Entity)
            .where(sql`cardinality(${Entity.version}) = 0`)
            .returning({ cardId: Entity.cardId });

        const deletedEntityLocalization = await tx.delete(EntityLocalization)
            .where(sql`cardinality(${EntityLocalization.version}) = 0`)
            .returning({ cardId: EntityLocalization.cardId });

        await tx.update(Patch).set({ isUpdated: false }).where(eq(Patch.buildNumber, buildNumber));

        return { deletedEntity, deletedEntityLocalization };
    });

    main.info(`Patch ${buildNumber} has been removed`, { category: 'hsdata' });

    return result;
}
