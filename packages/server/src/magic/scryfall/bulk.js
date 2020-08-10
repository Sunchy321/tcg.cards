import * as fs from 'fs';
import AsyncLock from 'async-lock';
import * as readline from 'readline';
import * as Reader from 'async-stream-reader';

import { data } from '../../../config';
import lineReader from '../../common/line-reader';

import { RawCardModel } from '../db/model/raw-card';

const lock = new AsyncLock();

let cardProgress = { status: 'idle' };
let rulingProgress = { status: 'idle' };

export function cardList() {
    const files = fs.readdirSync(data + '/magic/bulk/scryfall').map(v => v.replace(/\.json$/, ''));

    return files.filter(v => v.startsWith('all-cards')).sort();
}

export function loadCard(file) {
    lock.acquire('card', async () => {
        let rawCount = 0;

        for (let line of lineReader(data + '/magic/bulk/scryfall' + file + '.json')) {
            if (line === '[') {
                continue;
            } else if (line === ']') {
                break;
            }

            let text = line.trim();

            if (text.endsWith(',')) {
                text = text.slice(0, -1);
            }

            const json = JSON.parse(text);

            const rawCard = new RawCardModel(json);

            await rawCard.save();

            ++rawCount;

            cardProgress = {
                status: 'save-raw',
                count: rawCount
            }
        }

        cardProgress = { status: 'idle' };
    })
}

export function getCardProgress() {
    return cardProgress;
}

export function rulingList() {
    const files = fs.readdirSync(data + '/magic/bulk/scryfall').map(v => v.replace(/\.json$/, ''));

    return files.filter(v => v.startsWith('rulings')).sort();
}


export async function loadRuling(file) {

}

export function getRulingProgress() {
    return rulingProgress;
}