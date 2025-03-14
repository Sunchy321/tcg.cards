import { defineGameStore } from './game';

export const textModes = ['unified', 'printed'];
export type TextMode = 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useLorcana = defineGameStore<'lorcana', State>('lorcana', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
