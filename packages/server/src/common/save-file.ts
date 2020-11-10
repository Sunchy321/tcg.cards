import fs from 'fs';
import request, { Response } from 'request';
import progress, { Progress, RequestProgress } from 'request-progress';

import { ProgressHandler } from './progress';

export async function saveFile(url: string, path: string, override = false): Promise<void> {
    const dir = path.split('/').slice(0, -1).join('/');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(dir + '/.no-auto-save')) {
        return;
    }

    if (fs.existsSync(path) && fs.statSync(path).size > 0 && !override) {
        return;
    }

    const response = await new Promise<Response>((resolve, reject) => {
        request.head(url, (err, res) => err != null ? reject(err) : resolve(res));
    });

    if (response.statusCode !== 200) {
        return;
    }

    return new Promise((resolve, reject) => {
        request(url)
            .on('error', reject)
            .on('end', resolve)
            .pipe(fs.createWriteStream(path));
    });
}

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
        const dir = this.path.split('/').slice(0, -1).join('/');

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(dir + '/.no-auto-save')) {
            return;
        }

        if (fs.existsSync(this.path) && fs.statSync(this.path).size > 0 && !this.override) {
            return;
        }

        this.request = progress(request(this.url));

        this.request.on('progress', p => this.emitProgress(p));

        return new Promise((resolve, reject) => {
            if (this.request != null) {
                this.request
                    .on('error', reject)
                    .on('end', resolve)
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
