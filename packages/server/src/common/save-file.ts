import {
    createWriteStream, existsSync, mkdirSync, statSync, unlinkSync,
} from 'fs';
import axios, { AxiosRequestConfig, AxiosProgressEvent } from 'axios';

import axiosRetry from 'axios-retry';

import Task from './task';

import { config } from '@/config';

interface ISaveFileOption {
    override?:    boolean;
    axiosOption?: Partial<AxiosRequestConfig<any>>;
}

axiosRetry(axios, {
    retries:    3,
    retryDelay: retryCount => retryCount * 1000,
});

export default class FileSaver extends Task<AxiosProgressEvent> {
    url:        string;
    path:       string;
    override:   boolean;
    controller: AbortController;

    axiosOption: Partial<AxiosRequestConfig<any>>;

    constructor(url: string, path: string, option: ISaveFileOption = {}) {
        super();

        this.url = url;
        this.path = path;

        this.override = option.override ?? false;
        this.controller = new AbortController();

        this.axiosOption = option.axiosOption ?? { };
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
            proxy:              config.axiosProxy,
            onDownloadProgress: progressEvent => this.emit('progress', progressEvent),
            ...this.axiosOption,
        }).then(async res => new Promise((resolve, reject) => {
            res.data.pipe(stream);

            res.data.on('error', reject);
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
