import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import request from 'request';
import progress, { Progress, RequestProgress } from 'request-progress';

import Task from './task';

interface ISaveFileOption {
    override?: boolean;
}

export default class FileSaver extends Task<Progress> {
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

    async startImpl(): Promise<string | void> {
        const dir = this.path.split('/').slice(0, -1).join('/');

        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        if (existsSync(dir + '/.no-auto-save')) {
            return 'auto_save_disabled';
        }

        if (FileSaver.fileExists(this.path) && !this.override) {
            return 'file_exists';
        }

        this.request = progress(request(this.url));

        return new Promise((resolve, reject) => {
            this.request!
                .on('response', res => {
                    if (res.statusCode !== 200) {
                        this.request?.abort();
                        resolve('network_error');
                    }
                })
                .on('progress', p => this.emit('progress', p))
                .on('error', reject)
                .on('end', resolve)
                .pipe(createWriteStream(this.path));
        });
    }

    stopImpl(): void {
        this.request?.abort();

        if (existsSync(this.path)) {
            unlinkSync(this.path);
        }
    }

    static fileExists(path: string): boolean {
        return existsSync(path) && statSync(path).size > 0;
    }
}
