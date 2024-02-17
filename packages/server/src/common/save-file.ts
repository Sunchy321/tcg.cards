import {
    createWriteStream, existsSync, mkdirSync, statSync, unlinkSync,
} from 'fs';
import axios, { AxiosProgressEvent } from 'axios';

import Task from './task';

interface ISaveFileOption {
    override?: boolean;
}

export default class FileSaver extends Task<AxiosProgressEvent> {
    url: string;
    path: string;
    override: boolean;
    controller: AbortController;

    constructor(url: string, path: string, option: ISaveFileOption = {}) {
        super();

        this.url = url;
        this.path = path;

        this.override = option.override ?? false;
        this.controller = new AbortController();
    }

    async startImpl(): Promise<string | void> {
        const dir = this.path.split('/').slice(0, -1).join('/');

        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        if (existsSync(`${dir}/.no-auto-save`)) {
            return 'auto_save_disabled';
        }

        if (FileSaver.fileExists(this.path) && !this.override) {
            return 'file_exists';
        }

        const stream = createWriteStream(this.path);

        return axios.get(this.url, {
            responseType:       'stream',
            signal:             this.controller.signal,
            onDownloadProgress: (progressEvent) => {
                this.emit('progress', progressEvent);
            },
        }).then(async res => new Promise((resolve, reject) => {
            res.data.pipe(stream);

            stream.on('finish', resolve);
            stream.on('error', reject);
        }));
    }

    stopImpl(): void {
        this.controller.abort();

        if (existsSync(this.path)) {
            unlinkSync(this.path);
        }
    }

    static fileExists(path: string): boolean {
        return existsSync(path) && statSync(path).size > 0;
    }
}
