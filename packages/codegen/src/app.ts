import { Project } from 'ts-morph';

import { Game } from './game';

function main() {
    const interfaceProj = new Project({ tsConfigFilePath: '../interface/tsconfig.json' });
    const commonProj = new Project({ tsConfigFilePath: '../common/tsconfig.json' });

    const interfaceSource = interfaceProj.getRootDirectories()[0];

    if (interfaceSource == null) {
        throw new Error('interface/src not found. abort.');
    }

    const commonSource = commonProj.getRootDirectories().find(s => s.getPath().endsWith('/common/src'));

    if (commonSource == null) {
        throw new Error('common/src not found. abort.');
    }

    const modelSource = commonSource.getDirectories().find(d => d.getPath().endsWith('/model'));

    if (modelSource == null) {
        throw new Error('common/src/model not found. abort.');
    }

    const games = interfaceSource.getDirectories();

    for (const g of games) {
        const model = modelSource.getDirectory(g.getBaseName());

        if (model == null) {
            console.log(`model not found for ${g.getBaseName()}`);
            continue;
        }

        const game = new Game(g, model);

        game.generate();
    }
}

try {
    main();
} catch (e) {
    console.error((e as Error).message);
}
