import { createModule } from './game';
import { GameModule } from './interface';

export type TextMode = 'oracle' | 'unified' | 'printed'
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

export type Module = GameModule<Data, State>

export default createModule<Data, State>('magic', {
    textMode: {
        type:    'enum',
        values:  textModes,
        default: 'printed',
    },
});
