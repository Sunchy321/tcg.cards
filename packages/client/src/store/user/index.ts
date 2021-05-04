import { Module } from '../interface';

import state, { State } from './state';
import * as getters from './getters';
import * as mutations from './mutations';
import * as actions from './actions';

export type UserModule = Module<true, State, typeof getters, typeof mutations, typeof actions>;

export default {
    namespaced: true,
    state,
    getters,
    mutations,
    actions,
};
