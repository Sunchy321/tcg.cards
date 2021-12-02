import { Action, ParamObject } from 'setup/page';
import { Game } from '../games';

export interface State {
    game: Game | null;
    locale: string;
    search: string;

    title: string;
    titleType: string;
    params: Record<any, ParamObject<any, boolean>>;
    actions: Action[];
}

export default {
    game:   null,
    locale: 'en',
    search: '',

    title:     '',
    titleType: 'text',
    params:    { },
    actions:   [],
} as State;
