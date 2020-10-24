import fs from 'fs';
import request from 'request';
import progress, { Progress, RequestProgress } from 'request-progress';

import * as logger from '../logger';
import { ProgressHandler } from './progress';

interface ISaveFileOption {
    override?: boolean;
}

export default class FileSaver extends ProgressHandler<Progress> {
    url: string;
    path: string;
    override = false;

    request?: RequestProgress;

    constructor(url: string, path: string, option: ISaveFileOption = {}) {
        super();

        this.url = url;
        this.path = path;

        if (option.override != null) {
            this.override = option.override;
        }
    }

    async action(): Promise<void> {
        const fileInfo = `${this.url} -> ${this.path}`;

        const override = this.override;

        const dir = this.path.split('/').slice(0, -1).join('/');

        if (fs.existsSync(dir + '/.no-auto-save')) {
            logger.main.info(`${fileInfo}: skipped`, { category: 'file' });
            return;
        }

        if (fs.existsSync(this.path) && !override) {
            logger.main.info(`${fileInfo}: exists`, { category: 'file' });
            return;
        }

        this.request = progress(request(this.url));

        this.request.on('progress', p => this.emitProgress(p));

        return new Promise((resolve, reject) => {
            if (this.request != null) {
                this.request
                    .on('error', reject)
                    .on('end', () => {
                        logger.main.info(`${fileInfo}: downloaded`, { category: 'file' });
                        resolve();
                    })
                    .pipe(fs.createWriteStream(this.path));
            }
        });
    }

    abort(): void {
        if (this.request != null) {
            this.request.abort();
        }
    }

    equals(url: string, path: string): boolean {
        return this.url === url && this.path === path;
    }
}
