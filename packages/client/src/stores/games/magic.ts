import { defineGameStore } from './game';

export const textModes = ['oracle', 'unified', 'printed'];
export type TextMode = 'oracle' | 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useGame = defineGameStore<'magic', State>('magic', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
