import Task from '@/common/task';

import { GameTask as magic } from './magic';
import { GameTask as ptcg } from './ptcg';
import { GameTask as yugioh } from './yugioh';
import { GameTask as lorcana } from './lorcana';
import { GameTask as hearthstone } from './hearthstone';

import { Game, games } from '@static/index';

import Card from '@/integrated/db/card';

interface Status {
    method: string;
    type:   string;

    game: string;

    amount: {
        count: number;
        total: number;
    };

    overall: {
        gameCount: number;
        gameTotal: number;

        count: number;
        total: number;
    };

    time: {
        elapsed:   number;
        remaining: number;
    };
}

export interface GameStatus {
    game: Game;

    amount: {
        count: number;
        total: number;
    };
}

export type GameTaskConstructor = {
    new(): Task<GameStatus>;
    count(): Promise<number>;
};

const Tasks: Record<Game, GameTaskConstructor> = {
    magic,
    ptcg,
    yugioh,
    hearthstone,
    lorcana,
};

export class SyncTask extends Task<Status> {
    currTask?: Task<GameStatus>;

    async startImpl(): Promise<void> {
        const start = Date.now();

        const gameCount = 0;
        let game: Game = games[0];

        let overallCount = 0;
        let overallTotal = 0;

        let count = 0;
        let total = 0;

        this.intervalProgress(500, function () {
            const elapsed = Date.now() - start;

            return {
                method: 'post',
                type:   'card',

                game,

                amount: {
                    count,
                    total,
                },

                overall: {
                    gameCount: gameCount,
                    gameTotal: games.length,

                    count: overallCount,
                    total: overallTotal,
                },

                time: {
                    elapsed,
                    remaining: (elapsed / overallCount) * (overallTotal - overallCount),
                },
            };
        });

        Card.deleteMany();

        for (const g of games) {
            const Task = Tasks[g];

            overallTotal += await Task.count();
        }

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < games.length; ++i) {
            game = games[i];

            const Task = Tasks[game];

            const task = new Task();

            const startCount = overallCount;

            task.on('progress', (status: GameStatus) => {
                count = status.amount.count;
                total = status.amount.total;

                overallCount = startCount + status.amount.count;
            });

            task.start();

            await task.waitForEnd();

            overallCount = startCount + total;
        }
    }

    stopImpl(): void {
        if (this.currTask != null) {
            this.currTask.stop();
        }
    }

    equals(): boolean { return true; }
}
