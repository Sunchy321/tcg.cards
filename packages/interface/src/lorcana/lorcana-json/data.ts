import { Card } from './card';
import { Set } from './set';

export type Data = {
    metadata: {
        formatVersion: string;
        generatedOn:   string;
        language:      string;
    };

    sets:  Record<string, Set>;
    cards: Card[];
};
