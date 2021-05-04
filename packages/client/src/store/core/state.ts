import { Action, ParamObject } from 'setup/page';

export interface State {
    games: string[];
    locale: string;
    search: string;

    title: string;
    titleType: string;
    params: Record<any, ParamObject<any, boolean>>;
    actions: Action[];
}

export default {
    games:  [],
    locale: 'en',
    search: '',

    title:     '',
    titleType: 'text',
    params:    { },
    actions:   [],
} as State;
