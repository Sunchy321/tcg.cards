import { Project } from 'ts-morph';

import { Game } from './game';

function main() {
    const project = new Project({
        tsConfigFilePath: '../interface/tsconfig.json',
    });

    const src = project.getRootDirectories()[0];

    if (src == null) {
        throw new Error('src not found. abort.');
        return;
    }

    const games = src.getDirectories();

    for (const g of games) {
        const game = new Game(g);

        game.generate();
    }
}

try {
    main();
} catch (e) {
    console.error((e as Error).message);
}
