import { parseLog } from '../src';
import { readFileSync, existsSync } from 'fs';

test('', () => {
    if (existsSync('./Power.log')) {
        const log = parseLog(readFileSync('./Power.log').toString());

        console.log(log);
    }
});
