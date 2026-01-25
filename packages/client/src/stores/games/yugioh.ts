import { defineGameStore } from './game';

import { Locale } from '@model/yugioh/schema/basic';

export const textModes = ['unified', 'printed'];
export type TextMode = 'printed' | 'unified';

interface State {
    textMode: TextMode;
}

export const useGame = defineGameStore<'yugioh', State, Locale>('yugioh', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
