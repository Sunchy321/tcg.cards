import yaml from 'yaml';
import fs from 'fs';
import { join } from 'path';
import { last } from 'lodash';

export default function internalData<T = any>(basePath: string, id: string): T {
    const parts = id.split('.');

    const dirPath = join(basePath, ...parts);
    const path = join(basePath, ...parts.slice(0, -1), `${last(parts)!}.yml`);

    if (!fs.existsSync(path) && fs.statSync(dirPath).isDirectory()) {
        const content = fs.readdirSync(dirPath);

        return content.map(f => f.replace(/\.yml$/, '')) as T;
    } else {
        const content = fs.readFileSync(path).toString();

        const data = yaml.parse(content);

        return data as T;
    }
}
