import { defineGameStore } from './game';

import { Locale } from '@model/lorcana/schema/basic';

export const textModes = ['unified', 'printed'];
export type TextMode = 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useGame = defineGameStore<'lorcana', State, Locale>('lorcana', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
