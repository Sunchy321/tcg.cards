import { defineGameStore } from './game';

import { FullLocale } from '@model/magic/basic';

export const textModes = ['oracle', 'unified', 'printed'];
export type TextMode = 'oracle' | 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useGame = defineGameStore<'magic', State, FullLocale>('magic', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
