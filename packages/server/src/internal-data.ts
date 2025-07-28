import yaml from 'js-yaml';
import * as fs from 'fs';
import { join } from 'path';
import _ from 'lodash';

import { dataPath, internalDataPath } from '@/config';

export default function internalData<T = any>(id: string): T {
    const basePath = internalDataPath ?? dataPath;

    const parts = id.split('.');

    const dirPath = join(basePath, ...parts);
    const path = join(basePath, ...parts.slice(0, -1), `${_.last(parts)!}.yml`);

    if (!fs.existsSync(path) && fs.statSync(dirPath).isDirectory()) {
        const content = fs.readdirSync(dirPath);

        return content.map(f => f.replace(/\.yml$/, '')) as T;
    } else {
        const content = fs.readFileSync(path).toString();

        return yaml.load(content) as T;
    }
}
