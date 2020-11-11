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

    startImpl(): void {
        const dir = this.path.split('/').slice(0, -1).join('/');

        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        if (existsSync(dir + '/.no-auto-save')) {
            this.emit('end', 'auto_save_disabled');
            return;
        }

        if (existsSync(this.path) && statSync(this.path).size > 0 && !this.override) {
            this.emit('end', 'file_exists');
            return;
        }

        this.request = progress(request(this.url));

        this.request
            .on('response', res => {
                if (res.statusCode !== 200) {
                    this.request?.abort();
                    this.emit('end', 'network_error');
                }
            })
            .on('progress', p => this.emit('progress', p))
            .on('error', e => this.emit('error', e))
            .on('end', () => this.emit('end'))
            .pipe(createWriteStream(this.path));
    }

    stopImpl(): void {
        this.request?.abort();
        unlinkSync(this.path);
    }
}
