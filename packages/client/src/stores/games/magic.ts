import { defineGameStore } from './game';

import { Locale } from '@model/magic/schema/basic';

export const textModes = ['oracle', 'unified', 'printed'];
export type TextMode = 'oracle' | 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useGame = defineGameStore<'magic', State, Locale>('magic', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
