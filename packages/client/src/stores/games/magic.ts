import { defineGameStore } from './game';

export type TextMode = 'oracle' | 'printed' | 'unified';
export const textModes = ['oracle', 'unified', 'printed'];

interface Data {
    birthday: string;
    locales: string[];
    extendedLocales: string[];
    symbols: string[];
    formats: string[];
}

interface State {
    textMode: TextMode;
}

export const useMagic = defineGameStore<'magic', Data, State>('magic', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
