import { Module } from '../interface';

import state, { State } from './state';
import * as getters from './getters';
import * as mutations from './mutations';
import * as actions from './actions';

export type CoreModule = Module<false, State, typeof getters, typeof mutations, typeof actions>;

export default {
    state,
    getters,
    mutations,
    actions,
};
